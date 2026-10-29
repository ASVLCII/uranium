import { createHash } from "node:crypto";
import { realpathSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export const DEFAULT_PYTHON = process.platform === "win32" ? "python" : "python3";
export const DEFAULT_HOME = process.platform === "win32" ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData/Local"), "Uranium")
  : process.platform === "darwin" ? join(homedir(), "Library/Application Support/Uranium")
  : join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "uranium");
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
function startBridge(python: string, request: string) {
  const script = join(moduleDirectory, "../scripts/memory_bridge.py");
  const env = { ...process.env, PYTHONUTF8: "1" };
  if (typeof Bun !== "undefined") {
    const child = Bun.spawn([python, "-I", "-S", "-X", "utf8", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env });
    const completed = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      .then(([stdout, , exit]) => ({ stdout, exit }));
    child.stdin.write(request); child.stdin.end();
    return { child, completed };
  }
  const child = spawn(python, ["-I", "-S", "-X", "utf8", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 2_000_000) child.kill(); });
  child.stderr.resume(); child.stdin.on("error", () => {});
  const completed = new Promise<{ stdout: string; exit: number | null }>((resolve, reject) => {
    child.once("error", reject); child.once("close", exit => resolve({ stdout, exit }));
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
  constructor(readonly project: string, readonly data = process.env.URANIUM_HOME || DEFAULT_HOME,
    readonly python = process.env.URANIUM_MEMORY_PYTHON || DEFAULT_PYTHON) {}
  home(scope = "project") { return join(this.data, scope === "user" ? "user" : `projects/${this.project.slice(5)}`); }
  async call(operation: string, values: Record<string, unknown> = {}, signal?: AbortSignal): Promise<any> {
    const scope = values.scope === "user" ? "user" : "project";
    if (signal?.aborted) throw new Error("Memory request cancelled");
    const request = JSON.stringify({ ...values, operation, home: this.home(scope), project: this.project, scope,
      engineCache: process.env.URANIUM_ENGINE_CACHE || join(DEFAULT_HOME, "engine") });
    if (Buffer.byteLength(request) > 65536) throw new Error("Memory request too large");
    const { child, completed } = startBridge(this.python, request);
    const cancel = () => child.kill();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 60000);
    try {
      const { stdout, exit } = await completed;
      if (signal?.aborted) throw new Error("Memory request cancelled");
      let response;
      try { response = JSON.parse(stdout); } catch { throw new Error(`Memory engine unavailable (exit ${exit}); verify URANIUM_MEMORY_PYTHON`); }
      if (exit !== 0 || !response.ok) throw new Error(response.message || `Memory engine failed (${exit})`);
      return response.result;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  }
  async recall(query: string, session: string) {
    const packs = await Promise.all([this.call("recall", { query, session }), this.call("recall", { query, session, scope: "user" })]);
    const records = packs.flatMap(p => p.included_records ?? []);
    // Treat memory as quoted evidence. Enforce the final budget including labels and IDs.
    const lines: string[] = []; let used = 0;
    for (const record of records) {
      const line = JSON.stringify({ id: record.record_id, summary: record.summary, type: record.record_type });
      if (used + line.length + 1 > 3500) continue;
      lines.push(line); used += line.length + 1;
    }
    return { text: lines.join("\n"), count: lines.length, packs };
  }
}
