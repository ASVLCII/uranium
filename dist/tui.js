// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// node_modules/@opencode/plugin/dist/tui/plugin.js
var exports_plugin = {};
__export(exports_plugin, {
  define: () => define
});
function define(plugin) {
  return plugin;
}
// node_modules/solid-js/dist/server.js
var $PROXY = Symbol("solid-proxy");
var $TRACK = Symbol("solid-track");
var $DEVCOMP = Symbol("solid-dev-component");
var ERROR = Symbol("error");
function castError(err) {
  if (err instanceof Error)
    return err;
  return new Error(typeof err === "string" ? err : "Unknown error", {
    cause: err
  });
}
function handleError(err, owner = Owner) {
  const fns = owner && owner.context && owner.context[ERROR];
  const error = castError(err);
  if (!fns)
    throw error;
  try {
    for (const f of fns)
      f(error);
  } catch (e) {
    handleError(e, owner && owner.owner || null);
  }
}
var Owner = null;
function createOwner() {
  const o = {
    owner: Owner,
    context: Owner ? Owner.context : null,
    owned: null,
    cleanups: null
  };
  if (Owner) {
    if (!Owner.owned)
      Owner.owned = [o];
    else
      Owner.owned.push(o);
  }
  return o;
}
function createMemo(fn, value) {
  Owner = createOwner();
  let v;
  try {
    v = fn(value);
  } catch (err) {
    handleError(err);
  } finally {
    Owner = Owner.owner;
  }
  return () => v;
}
function createContext(defaultValue) {
  const id = Symbol("context");
  return {
    id,
    Provider: createProvider(id),
    defaultValue
  };
}
function children(fn) {
  const memo = createMemo(() => resolveChildren(fn()));
  memo.toArray = () => {
    const c = memo();
    return Array.isArray(c) ? c : c != null ? [c] : [];
  };
  return memo;
}
function resolveChildren(children2) {
  if (typeof children2 === "function" && !children2.length)
    return resolveChildren(children2());
  if (Array.isArray(children2)) {
    const results = [];
    for (let i = 0;i < children2.length; i++) {
      const result = resolveChildren(children2[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children2;
}
function createProvider(id) {
  return function provider(props) {
    return createMemo(() => {
      Owner.context = {
        ...Owner.context,
        [id]: props.value
      };
      return children(() => props.children);
    });
  };
}
var SuspenseContext = createContext();

// node_modules/@opencode/plugin/dist/tui/solid.js
var PluginContext = createContext();
// src/tui.ts
import { TextRenderable, StyledText, fg } from "@opentui/core";

// src/memory.ts
import { createHash } from "crypto";
import { realpathSync, existsSync, readFileSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
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

// src/tui.ts
var tui_default = exports_plugin.define({
  id: "uranium.ui",
  setup(context) {
    const status = context.ui.slot({ append: "home.footer.status", render: () => new TextRenderable(context.renderer, {
      id: "uranium-status",
      content: new StyledText([fg("#A8E000")("URANIUM \xB7 U92"), fg("#78856B")("   /memory \xB7 /uranium-plan \xB7 /uranium-resume")])
    }) });
    const commands = context.ui.slot({ append: "app", render: () => {
      context.keymap.layer(() => ({ mode: "global", commands: [{
        id: "uranium.memory",
        title: "Uranium memory",
        group: "Uranium",
        palette: true,
        slash: { name: "memory", arguments: true },
        async run(input) {
          const memory = new Memory(projectKey(context.data.location.default().directory));
          const route = context.ui.router.current(), session = route.type === "session" ? route.sessionID : "operator";
          try {
            const action = input?.trim() || await context.ui.dialog.select({ title: "Uranium memory", options: [
              { title: "Review project candidates", value: "review" },
              { title: "Capture project knowledge", value: "capture" },
              { title: "Recall reviewed knowledge", value: "recall" },
              { title: "Personal memory across projects", value: "user" }
            ] });
            if (!action)
              return;
            let scope = "project", operation = action;
            if (action === "user") {
              scope = "user";
              operation = await context.ui.dialog.select({ title: "Personal memory \xB7 available across your projects", options: [
                { title: "Review personal candidates", value: "review" },
                { title: "Capture a personal preference", value: "capture" },
                { title: "Recall personal knowledge", value: "recall" }
              ] }) ?? "";
            }
            if (operation === "capture" || operation === "recall") {
              const text = await context.ui.dialog.prompt({ title: operation === "capture" ? "Short durable summary \xB7 no credentials or transcripts" : "Recall query" });
              if (!text?.trim())
                return;
              const result = await memory.call(operation, { scope, session, summary: text, query: text });
              await context.ui.dialog.alert({ title: operation === "capture" ? "Captured for review" : "Recall evidence", message: JSON.stringify(result, null, 2) });
            } else if (operation === "review") {
              const queue = await memory.call("review", { scope, session });
              if (!queue.cards?.length) {
                context.ui.toast.show({ message: "No pending memory candidates.", variant: "info" });
                return;
              }
              const id = await context.ui.dialog.select({ title: "Pending memory \xB7 select to inspect", options: queue.cards.map((card2) => ({ title: card2.summary, value: card2.candidate_id })) });
              const card = queue.cards.find((value) => value.candidate_id === id);
              if (!card)
                return;
              await context.ui.dialog.alert({ title: "Review exact memory candidate", message: JSON.stringify(card, null, 2) });
              const decision = await context.ui.dialog.select({ title: "Decision for this reviewed revision", options: [
                { title: "Leave pending", value: "pending" },
                { title: "Approve for future recall", value: "approve" },
                { title: "Reject", value: "reject" }
              ] });
              if (!decision || decision === "pending")
                return;
              await memory.call(decision, { scope, session, id, revision: card.review_revision });
              context.ui.toast.show({ message: decision === "approve" ? "Memory approved for recall." : "Candidate rejected.", variant: "info" });
            } else
              context.ui.toast.show({ message: "/memory: review, capture, recall or user", variant: "info" });
          } catch (error) {
            context.ui.toast.show({ title: "Uranium memory", message: String(error), variant: "error" });
          }
        }
      }] }));
      return null;
    } });
    return () => {
      commands();
      status();
    };
  }
});
export {
  tui_default as default
};
