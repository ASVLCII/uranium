import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import server from "../src/server.ts";
import { Memory, projectKey } from "../src/memory.ts";
type Context = Parameters<typeof server.setup>[0];

test("registered context hook delivers real approved memory and checkpoints; compaction and foreign sessions stay scoped", async () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-hooks-"));
  const original = process.env.URANIUM_HOME; process.env.URANIUM_HOME = directory;
  let cleanup: Awaited<ReturnType<typeof server.setup>> = undefined;
  try {
    const memory = new Memory(projectKey(directory), directory);
    await memory.call("capture", { summary: "The seabird project requires SQLite WAL journaling." });
    const card = (await memory.call("review")).cards[0];
    await memory.call("approve", { id: card.candidate_id, revision: card.review_revision });
    const hooks: Record<string, Function> = {}, tools = new Map<string, any>(); let disposed = 0;
    const registration = { dispose: async () => { disposed++; } };
    const context = {
      app: { version: "2.2.1" }, location: { directory, project: { canonical: directory } },
      skill: { transform: async (callback: Function) => { callback({ add: () => {} }); return registration; } },
      session: { get: async ({ sessionID }: any) => ({ location: { directory: sessionID === "foreign" ? tmpdir() : directory } }), hook: async (name: string, callback: Function) => { hooks[name] = callback; return registration; } },
      tool: { hook: async (name: string, callback: Function) => { hooks[name] = callback; return registration; }, transform: async (callback: Function) => { callback({ add: (tool: any) => tools.set(tool.name, tool) }); return registration; } },
      command: { transform: async (callback: Function) => { callback({ add: () => {} }); return registration; } },
    } as unknown as Context;
    cleanup = await server.setup(context);
    await hooks["execute.before"]({ sessionID: "s", id: "unfinished", tool: "shell" });
    await hooks.prompt({ sessionID: "s", prompt: { text: "seabird SQLite WAL" } });
    await tools.get("uranium_workflow").execute({ action: "save", plan: { name: "Seabird plan", tasks: [{ id: "a", description: "Verify database", writes: [], dependsOn: [], verify: ["run tests"] }] } }, { sessionID: "s" });
    const automatic = JSON.parse((await tools.get("uranium_checkpoint").execute({ action: "read" }, { sessionID: "s" })).content);
    expect(automatic.automatic).toBe(true); expect(automatic.completed).toEqual([]);
    await tools.get("uranium_checkpoint").execute({ action: "save", state: { goal: "Implement WAL", next: ["Run database tests"] } }, { sessionID: "s" });
    const event = { sessionID: "s", messages: [], system: [] as any[], model: { providerID: "fixture", model: "fixture" } };
    await hooks.context(event);
    expect(JSON.stringify(event.system)).toContain("seabird project requires SQLite WAL");
    expect(JSON.stringify(event.system)).toContain("Run database tests");
    expect(JSON.stringify(event.system)).toContain("unfinished");
    await tools.get("uranium_workflow").execute({ action: "save", plan: { name: "Updated plan", tasks: [{ id: "b", description: "Inspect tests", writes: [], dependsOn: [], verify: ["run tests"] }] } }, { sessionID: "s" });
    expect(JSON.parse((await tools.get("uranium_checkpoint").execute({ action: "read" }, { sessionID: "s" })).content).goal).toBe("Implement WAL");
    const compact = { sessionID: "s", system: [] as any[] }; await hooks.compaction(compact);
    expect(JSON.stringify(compact.system)).toContain("Run database tests");
    const handoff = JSON.parse((await tools.get("uranium_handoff").execute({ action: "create" }, { sessionID: "s" })).content);
    await tools.get("uranium_handoff").execute({ action: "adopt", id: handoff.id }, { sessionID: "destination" });
    const resumed = { sessionID: "destination", system: [] as any[] }; await hooks.compaction(resumed);
    expect(JSON.stringify(resumed.system)).toContain("imported completed-work claims remain unverified");
    await expect(tools.get("uranium_handoff").execute({ action: "list" }, { sessionID: "foreign" })).rejects.toThrow("mismatch");
    const explanation = JSON.parse((await tools.get("uranium_memory").execute({ action: "explain", query: "seabird SQLite WAL" }, { sessionID: "s" })).content);
    expect(explanation.deliveredCount).toBeGreaterThan(0);
    const foreign = { ...event, sessionID: "foreign", system: [] }; await hooks.context(foreign); expect(foreign.system).toHaveLength(0);
    await expect(tools.get("uranium_memory").execute({ action: "capture", scope: "user", summary: "personal" }, { sessionID: "s" })).rejects.toThrow("operator");
    await cleanup?.(); cleanup = undefined; expect(disposed).toBe(8);
  } finally {
    await cleanup?.();
    if (original === undefined) delete process.env.URANIUM_HOME; else process.env.URANIUM_HOME = original;
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);

test("corrupt continuity storage does not prevent native context or tool execution", async () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-corrupt-"));
  const original = process.env.URANIUM_HOME; process.env.URANIUM_HOME = directory;
  let cleanup: Awaited<ReturnType<typeof server.setup>> = undefined;
  try {
    const memory = new Memory(projectKey(directory), directory);
    mkdirSync(memory.home(), { recursive: true });
    const file = join(memory.home(), "continuity.sqlite"); writeFileSync(file, "invalid fixture database");
    const hooks: Record<string, Function> = {}, registration = { dispose: async () => {} };
    const ctx = {
      app: { version: "2.2.1" }, location: { directory, project: { canonical: directory } },
      skill: { transform: async (cb: Function) => { cb({ add: () => {} }); return registration; } },
      session: { get: async () => ({ location: { directory } }), hook: async (name: string, cb: Function) => { hooks[name] = cb; return registration; } },
      tool: { transform: async (cb: Function) => { cb({ add: () => {} }); return registration; }, hook: async (name: string, cb: Function) => { hooks[name] = cb; return registration; } },
      command: { transform: async (cb: Function) => { cb({ add: () => {} }); return registration; } },
    } as unknown as Context;
    cleanup = await server.setup(ctx);
    await hooks["execute.before"]({ sessionID: "s", id: "one", tool: "shell" });
    const event = { sessionID: "s", messages: [], system: [] as any[], model: {} };
    await hooks.context(event);
    expect(JSON.stringify(event.system)).toContain("continuity storage is unavailable");
    expect(readFileSync(file, "utf8")).toBe("invalid fixture database");
  } finally {
    await cleanup?.();
    if (original === undefined) delete process.env.URANIUM_HOME; else process.env.URANIUM_HOME = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("status reports unavailable Python separately and cleanup disposes all hooks after one failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-status-"));
  const previousHome = process.env.URANIUM_HOME, previousPython = process.env.URANIUM_MEMORY_PYTHON;
  process.env.URANIUM_HOME = directory; process.env.URANIUM_MEMORY_PYTHON = "uranium-missing-python-fixture";
  let cleanup: Awaited<ReturnType<typeof server.setup>> = undefined;
  let disposed = 0, prompt = ""; const commands = new Map<string, any>();
  const registration = { dispose: async () => { disposed++; if (disposed === 2) throw new Error("fixture disposal failure"); } };
  try {
    const ctx = {
      app: { version: "2.2.1" }, location: { directory, project: { canonical: directory } },
      skill: { transform: async (cb: Function) => { cb({ add: () => {} }); return registration; } },
      session: { get: async () => ({ location: { directory } }), hook: async () => registration, prompt: async (value: any) => { prompt = value.text; } },
      tool: { transform: async (cb: Function) => { cb({ add: () => {} }); return registration; }, hook: async () => registration },
      command: { transform: async (cb: Function) => { cb({ add: (command: any) => commands.set(command.name, command) }); return registration; } },
    } as unknown as Context;
    cleanup = await server.setup(ctx);
    await commands.get("uranium-status").execute({ sessionID: "s", prompt: { text: "" }, delivery: {} });
    expect(prompt).toContain('"memoryAvailable":false'); expect(prompt).toContain('"continuityAvailable":true');
    await expect(cleanup?.()).rejects.toThrow("cleanup encountered errors");
    expect(disposed).toBe(8);
    await cleanup?.(); cleanup = undefined;
  } finally {
    await cleanup?.();
    if (previousHome === undefined) delete process.env.URANIUM_HOME; else process.env.URANIUM_HOME = previousHome;
    if (previousPython === undefined) delete process.env.URANIUM_MEMORY_PYTHON; else process.env.URANIUM_MEMORY_PYTHON = previousPython;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a partial setup failure releases earlier registrations without opening continuity storage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-setup-failure-")), previous = process.env.URANIUM_HOME;
  process.env.URANIUM_HOME = directory; let disposed = 0, subscribed = 0;
  const registration = { dispose: async () => { disposed++; } };
  try {
    const ctx = { location: { directory, project: { canonical: directory } },
      skill: { transform: async () => registration },
      session: { hook: async () => { if (++subscribed === 2) throw new Error("fixture setup failure"); return registration; } },
    } as unknown as Context;
    await expect(server.setup(ctx)).rejects.toThrow("fixture setup failure");
    expect(disposed).toBe(2); expect(existsSync(new Memory(projectKey(directory), directory).home())).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.URANIUM_HOME; else process.env.URANIUM_HOME = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
