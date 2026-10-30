import { createHash } from "node:crypto";
import { realpathSync, existsSync, readFileSync, statSync, opendirSync, type Dir } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { renderRecall } from "./recall.ts";

export const DEFAULT_PYTHON = process.platform === "win32" ? "python" : "python3";
export const DEFAULT_HOME = process.platform === "win32" ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData/Local"), "Uranium")
  : process.platform === "darwin" ? join(homedir(), "Library/Application Support/Uranium")
  : join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "uranium");
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
function stopBridge(child: { pid?: number; kill(): unknown }) {
  if (process.platform !== "win32" || !child.pid) { child.kill(); return; }
  // Windows venv launchers can own another Python process; terminate this owned tree.
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  killer.once("error", () => { child.kill(); });
  killer.once("exit", code => { if (code) child.kill(); }); killer.unref();
}
async function boundedText(stream: ReadableStream<Uint8Array>, maximum: number, stop: () => void) {
  const reader = stream.getReader(), decoder = new TextDecoder(); let value = "", bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) { stop(); await reader.cancel(); throw new Error("Memory response exceeded its resource limit"); }
      value += decoder.decode(chunk.value, { stream: true });
    }
    return value + decoder.decode();
  } finally { reader.releaseLock(); }
}
function startBridge(python: string, request: string) {
  const script = join(moduleDirectory, "../scripts/memory_bridge.py");
  const env = { ...process.env, PYTHONUTF8: "1" };
  if (typeof Bun !== "undefined") {
    const child = Bun.spawn([python, "-I", "-S", "-X", "utf8", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env });
    const completed = Promise.all([boundedText(child.stdout, 2_000_000, () => stopBridge(child)), boundedText(child.stderr, 65536, () => stopBridge(child)), child.exited])
      .then(([stdout, , exit]) => ({ stdout, exit }));
    child.stdin.write(request); child.stdin.end();
    return { child, completed };
  }
  const child = spawn(python, ["-I", "-S", "-X", "utf8", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env });
  let stdout = "", oversized = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => { if (oversized) return; if (stdout.length + chunk.length > 2_000_000) { oversized = true; stopBridge(child); } else stdout += chunk; });
  child.stderr.resume(); child.stdin.on("error", () => {});
  const completed = new Promise<{ stdout: string; exit: number | null }>((resolve, reject) => {
    child.once("error", reject); child.once("close", exit => oversized ? reject(new Error("Memory response exceeded its resource limit")) : resolve({ stdout, exit }));
  });
  child.stdin.end(request);
  return { child, completed };
}
export function projectKey(root: string) {
  const original = realpathSync(root);
  let directory = original, selected = original;
  while (true) {
    const marker = join(directory, ".git");
    if (existsSync(marker)) {
      selected = directory;
      if (statSync(marker).isFile()) {
        const text = readFileSync(marker, "utf8").trim();
        if (text.startsWith("gitdir: ")) {
          const gitdir = resolve(directory, text.slice(8));
          const common = join(gitdir, "commondir");
          if (existsSync(common)) selected = dirname(realpathSync(resolve(gitdir, readFileSync(common, "utf8").trim())));
        }
      }
      break;
    }
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  let canonical = selected.replaceAll("\\", "/").replace(/\/$/, "");
  if (process.platform === "win32") canonical = canonical.toLowerCase();
  return "repo:" + createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
export class Memory {
  readonly diagnostics = { bridgeLaunches: 0 };
  constructor(readonly project: string, readonly data = process.env.URANIUM_HOME || DEFAULT_HOME,
    readonly python = process.env.URANIUM_MEMORY_PYTHON || DEFAULT_PYTHON) {}
  home(scope = "project") { return join(this.data, scope === "user" ? "user" : `projects/${this.project.slice(5)}`); }
  async call(operation: string, values: Record<string, unknown> = {}, signal?: AbortSignal): Promise<any> {
    const scope = values.scope === "user" ? "user" : "project";
    if (signal?.aborted) throw new Error("Memory request cancelled");
    const request = JSON.stringify({ ...values, operation, home: this.home(scope), project: this.project, scope,
      engineCache: process.env.URANIUM_ENGINE_CACHE || join(DEFAULT_HOME, "engine") });
    if (Buffer.byteLength(request) > 65536) throw new Error("Memory request too large");
    this.diagnostics.bridgeLaunches++;
    const { child, completed } = startBridge(this.python, request);
    let rejectCancellation!: (error: Error) => void;
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const cancel = () => { stopBridge(child); rejectCancellation(new Error("Memory request cancelled")); };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => { stopBridge(child); rejectCancellation(new Error("Memory request timed out after 60 seconds")); }, 60000);
    try {
      if (signal?.aborted) cancel();
      const { stdout, exit } = await Promise.race([completed, cancellation]);
      if (signal?.aborted) throw new Error("Memory request cancelled");
      let response;
      try { response = JSON.parse(stdout); } catch { throw new Error(`Memory engine unavailable (exit ${exit}); verify URANIUM_MEMORY_PYTHON`); }
      if (exit !== 0 || !response.ok) throw new Error(response.message || `Memory engine failed (${exit})`);
      return response.result;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  }
  async recall(query: string, session: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error("Memory request cancelled");
    const scopes = ["project", "user"].filter(scope => {
      let directory: Dir | undefined;
      try {
        directory = opendirSync(join(this.home(scope), "memory", "records"));
        let entry; while ((entry = directory.readSync())) if (entry.isFile() && entry.name.endsWith(".json")) return true;
        return false;
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
      finally { directory?.closeSync(); }
    });
    if (!scopes.length) return renderRecall([]);
    const result = await this.call("recall-batch", { query, session, scopes }, signal);
    return renderRecall(result.packs);
  }
}
