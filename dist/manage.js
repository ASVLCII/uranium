// src/memory.ts
import { createHash } from "node:crypto";
import { realpathSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
var DEFAULT_PYTHON = process.platform === "win32" ? "python" : "python3";
var DEFAULT_HOME = process.platform === "win32" ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData/Local"), "Uranium") : process.platform === "darwin" ? join(homedir(), "Library/Application Support/Uranium") : join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "uranium");
var moduleDirectory = dirname(fileURLToPath(import.meta.url));
function startBridge(python, request) {
  const script = join(moduleDirectory, "../scripts/memory_bridge.py");
  const env = { ...process.env, PYTHONUTF8: "1" };
  if (typeof Bun !== "undefined") {
    const child2 = Bun.spawn([python, "-I", "-S", "-X", "utf8", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env });
    const completed2 = Promise.all([new Response(child2.stdout).text(), new Response(child2.stderr).text(), child2.exited]).then(([stdout2, , exit]) => ({ stdout: stdout2, exit }));
    child2.stdin.write(request);
    child2.stdin.end();
    return { child: child2, completed: completed2 };
  }
  const child = spawn(python, ["-I", "-S", "-X", "utf8", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 2000000)
      child.kill();
  });
  child.stderr.resume();
  child.stdin.on("error", () => {});
  const completed = new Promise((resolve2, reject) => {
    child.once("error", reject);
    child.once("close", (exit) => resolve2({ stdout, exit }));
  });
  child.stdin.end(request);
  return { child, completed };
}
function projectKey(root) {
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
          if (existsSync(common))
            selected = dirname(realpathSync(resolve(gitdir, readFileSync(common, "utf8").trim())));
        }
      }
      break;
    }
    const parent = dirname(directory);
    if (parent === directory)
      break;
    directory = parent;
  }
  let canonical = selected.replaceAll("\\", "/").replace(/\/$/, "");
  if (process.platform === "win32")
    canonical = canonical.toLowerCase();
  return "repo:" + createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

class Memory {
  project;
  data;
  python;
  constructor(project, data = process.env.URANIUM_HOME || DEFAULT_HOME, python = process.env.URANIUM_MEMORY_PYTHON || DEFAULT_PYTHON) {
    this.project = project;
    this.data = data;
    this.python = python;
  }
  home(scope = "project") {
    return join(this.data, scope === "user" ? "user" : `projects/${this.project.slice(5)}`);
  }
  async call(operation, values = {}, signal) {
    const scope = values.scope === "user" ? "user" : "project";
    if (signal?.aborted)
      throw new Error("Memory request cancelled");
    const request = JSON.stringify({
      ...values,
      operation,
      home: this.home(scope),
      project: this.project,
      scope,
      engineCache: process.env.URANIUM_ENGINE_CACHE || join(DEFAULT_HOME, "engine")
    });
    if (Buffer.byteLength(request) > 65536)
      throw new Error("Memory request too large");
    const { child, completed } = startBridge(this.python, request);
    const cancel = () => child.kill();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 60000);
    try {
      const { stdout, exit } = await completed;
      if (signal?.aborted)
        throw new Error("Memory request cancelled");
      let response;
      try {
        response = JSON.parse(stdout);
      } catch {
        throw new Error(`Memory engine unavailable (exit ${exit}); verify URANIUM_MEMORY_PYTHON`);
      }
      if (exit !== 0 || !response.ok)
        throw new Error(response.message || `Memory engine failed (${exit})`);
      return response.result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  async recall(query, session) {
    const packs = await Promise.all([this.call("recall", { query, session }), this.call("recall", { query, session, scope: "user" })]);
    const records = packs.flatMap((p) => p.included_records ?? []);
    const lines = [];
    let used = 0;
    for (const record of records) {
      const line = JSON.stringify({ id: record.record_id, summary: record.summary, type: record.record_type });
      if (used + line.length + 1 > 3500)
        continue;
      lines.push(line);
      used += line.length + 1;
    }
    return { text: lines.join(`
`), count: lines.length, packs };
  }
}

// scripts/manage.ts
var [operation = "help", ...args] = process.argv.slice(process.argv[2] === "memory" ? 3 : 2);
if (operation === "help") {
  console.log("Uranium memory: capture [--user] <summary> | recall [--user] <query> | review [--user] | approve [--user] <candidate-id> <review-revision> | reject [--user] <candidate-id> <review-revision> | native <OMH memory subcommand and flags>");
} else {
  if (!["capture", "recall", "review", "approve", "reject", "native"].includes(operation))
    throw new Error("Unknown memory command");
  const user = args.includes("--user"), values = args.filter((x) => x !== "--user");
  const memory = new Memory(projectKey(process.cwd()));
  const result = await memory.call(operation, { scope: user ? "user" : "project", summary: values.join(" "), query: values.join(" "), id: values[0], revision: values[1], arguments: values });
  console.log(operation === "native" && typeof result.result?.message === "string" ? result.result.message : JSON.stringify(result, null, 2));
  if (operation === "native" && result.exitCode)
    process.exitCode = result.exitCode;
}
