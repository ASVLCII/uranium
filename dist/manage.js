// src/memory.ts
import { createHash } from "node:crypto";
import { realpathSync, existsSync, readFileSync, statSync, opendirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// src/recall.ts
var RECALL_BUDGET = 3500;
function text(value, limit = 160) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}
function project(record) {
  const freshness = {};
  if (record.staleness && typeof record.staleness === "object") {
    for (const [key, value] of Object.entries(record.staleness).slice(0, 12)) {
      if (typeof value === "string")
        freshness[key] = text(value);
      else if (typeof value === "number" || typeof value === "boolean" || value === null)
        freshness[key] = value;
    }
  }
  return {
    id: text(record.record_id),
    summary: text(record.summary, 500),
    type: text(record.record_type, 24),
    scope: { kind: text(record.scope?.kind, 24), ref: text(record.scope?.ref) },
    ...text(record.source) ? { source: text(record.source) } : {},
    ...text(record.approved_at) ? { approved_at: text(record.approved_at, 48) } : {},
    revision: Number.isSafeInteger(record.revision) ? record.revision : undefined,
    ...text(record.resolution) ? { resolution: text(record.resolution) } : {},
    ...text(record.resolution_marker) ? { resolution_marker: text(record.resolution_marker) } : {},
    ...Object.keys(freshness).length ? { freshness } : {}
  };
}
function renderRecall(packs, budget = RECALL_BUDGET) {
  const queues = packs.map((pack) => Array.isArray(pack.included_records) ? pack.included_records.map(project) : []);
  const lines = [];
  let used = 0;
  for (let position = 0;position < Math.max(0, ...queues.map((q) => q.length)); position++) {
    for (const queue of queues) {
      const record = queue[position];
      if (!record)
        continue;
      const line = JSON.stringify(record), needed = line.length + (lines.length ? 1 : 0);
      if (used + needed > budget)
        continue;
      lines.push(line);
      used += needed;
    }
  }
  return { text: lines.join(`
`), count: lines.length, packs };
}
function explainRecall(result) {
  const delivered = result.text ? result.text.split(`
`).map((line) => JSON.parse(line)) : [];
  const selected = new Set(delivered.map((record) => JSON.stringify([record.scope.kind, record.scope.ref, record.id])));
  const scopes = result.packs.map((pack) => {
    const included = Array.isArray(pack.included_records) ? pack.included_records : [];
    const excluded = Array.isArray(pack.excluded_records) ? pack.excluded_records : [];
    const reasons = Object.create(null);
    for (const record of excluded) {
      const reason = text(record.reason, 80) || "not_reported";
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
    return {
      scope: { kind: text(pack.scope?.kind, 24), ref: text(pack.scope?.ref) },
      intent: text(pack.query_intent, 48),
      engineIncluded: included.length,
      engineExcluded: excluded.length,
      exclusionCounts: reasons,
      candidates: included.slice(0, 12).map((record) => {
        const projected = project(record);
        return {
          id: projected.id,
          disposition: selected.has(JSON.stringify([projected.scope.kind, projected.scope.ref, projected.id])) ? "delivered" : "adapter_budget_cut",
          eligibility: text(record.eligibility_reason, 80) || "not_reported",
          freshness: projected.freshness,
          ranking: Object.fromEntries(["relevance_rank", "recency_rank", "usage_rank", "rrf_score_micro", "pinned"].flatMap((key) => {
            const value = record.ranking?.[key];
            return typeof value === "number" || typeof value === "boolean" ? [[key, value]] : [];
          }))
        };
      }),
      excluded: excluded.slice(0, 20).map((record) => ({ id: text(record.record_id), reason: text(record.reason, 80), duplicateOf: text(record.duplicate_of) || undefined })),
      excludedListTruncated: excluded.length > 20
    };
  });
  return {
    budget: RECALL_BUDGET,
    deliveredCharacters: result.text.length,
    deliveredCount: result.count,
    delivered,
    scopes,
    limits: "Fresh evaluation of approved stores, not a replay of an earlier model request. Empty stores are omitted. Engine exclusion lists may be bounded; pending review candidates are not delivered. Rankings apply within each scope, not across scopes."
  };
}

// src/memory.ts
var DEFAULT_PYTHON = process.platform === "win32" ? "python" : "python3";
var DEFAULT_HOME = process.platform === "win32" ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData/Local"), "Uranium") : process.platform === "darwin" ? join(homedir(), "Library/Application Support/Uranium") : join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "uranium");
var moduleDirectory = dirname(fileURLToPath(import.meta.url));
function stopBridge(child) {
  if (process.platform !== "win32" || !child.pid) {
    child.kill();
    return;
  }
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  killer.once("error", () => {
    child.kill();
  });
  killer.once("exit", (code) => {
    if (code)
      child.kill();
  });
  killer.unref();
}
async function boundedText(stream, maximum, stop) {
  const reader = stream.getReader(), decoder = new TextDecoder;
  let value = "", bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done)
        break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) {
        stop();
        await reader.cancel();
        throw new Error("Memory response exceeded its resource limit");
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    return value + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
function startBridge(python, request) {
  const script = join(moduleDirectory, "../scripts/memory_bridge.py");
  const env = { ...process.env, PYTHONUTF8: "1" };
  if (typeof Bun !== "undefined") {
    const child2 = Bun.spawn([python, "-I", "-S", "-X", "utf8", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env });
    const completed2 = Promise.all([boundedText(child2.stdout, 2000000, () => stopBridge(child2)), boundedText(child2.stderr, 65536, () => stopBridge(child2)), child2.exited]).then(([stdout2, , exit]) => ({ stdout: stdout2, exit }));
    child2.stdin.write(request);
    child2.stdin.end();
    return { child: child2, completed: completed2 };
  }
  const child = spawn(python, ["-I", "-S", "-X", "utf8", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env });
  let stdout = "", oversized = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (oversized)
      return;
    if (stdout.length + chunk.length > 2000000) {
      oversized = true;
      stopBridge(child);
    } else
      stdout += chunk;
  });
  child.stderr.resume();
  child.stdin.on("error", () => {});
  const completed = new Promise((resolve2, reject) => {
    child.once("error", reject);
    child.once("close", (exit) => oversized ? reject(new Error("Memory response exceeded its resource limit")) : resolve2({ stdout, exit }));
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
        const text2 = readFileSync(marker, "utf8").trim();
        if (text2.startsWith("gitdir: ")) {
          const gitdir = resolve(directory, text2.slice(8));
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
  diagnostics = { bridgeLaunches: 0 };
  constructor(project2, data = process.env.URANIUM_HOME || DEFAULT_HOME, python = process.env.URANIUM_MEMORY_PYTHON || DEFAULT_PYTHON) {
    this.project = project2;
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
    this.diagnostics.bridgeLaunches++;
    const { child, completed } = startBridge(this.python, request);
    let rejectCancellation;
    const cancellation = new Promise((_, reject) => {
      rejectCancellation = reject;
    });
    const cancel = () => {
      stopBridge(child);
      rejectCancellation(new Error("Memory request cancelled"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      stopBridge(child);
      rejectCancellation(new Error("Memory request timed out after 60 seconds"));
    }, 60000);
    try {
      if (signal?.aborted)
        cancel();
      const { stdout, exit } = await Promise.race([completed, cancellation]);
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
  async recall(query, session, signal) {
    if (signal?.aborted)
      throw new Error("Memory request cancelled");
    const scopes = ["project", "user"].filter((scope) => {
      let directory;
      try {
        directory = opendirSync(join(this.home(scope), "memory", "records"));
        let entry;
        while (entry = directory.readSync())
          if (entry.isFile() && entry.name.endsWith(".json"))
            return true;
        return false;
      } catch (error) {
        if (error.code === "ENOENT")
          return false;
        throw error;
      } finally {
        directory?.closeSync();
      }
    });
    if (!scopes.length)
      return renderRecall([]);
    const result = await this.call("recall-batch", { query, session, scopes }, signal);
    return renderRecall(result.packs);
  }
}

// scripts/manage.ts
var [operation = "help", ...args] = process.argv.slice(process.argv[2] === "memory" ? 3 : 2);
if (operation === "help") {
  console.log("Uranium memory: capture [--user] <summary> | recall [--user] <query> | explain <query> (project + personal) | review [--user] | approve [--user] <candidate-id> <review-revision> | reject [--user] <candidate-id> <review-revision> | native <OMH memory subcommand and flags>");
} else {
  if (!["capture", "recall", "explain", "review", "approve", "reject", "native"].includes(operation))
    throw new Error("Unknown memory command");
  const user = args.includes("--user"), values = args.filter((x) => x !== "--user");
  const memory = new Memory(projectKey(process.cwd()));
  if (operation === "explain" && user)
    throw new Error("explain evaluates project and personal memory together; omit --user");
  if (operation === "explain") {
    console.log(JSON.stringify(explainRecall(await memory.recall(values.join(" "), "operator-explain")), null, 2));
  } else {
    const result = await memory.call(operation, { scope: user ? "user" : "project", summary: values.join(" "), query: values.join(" "), id: values[0], revision: values[1], arguments: values });
    console.log(operation === "native" && typeof result.result?.message === "string" ? result.result.message : JSON.stringify(result, null, 2));
    if (operation === "native" && result.exitCode)
      process.exitCode = result.exitCode;
  }
}
