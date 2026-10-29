import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
    await hooks.prompt({ sessionID: "s", prompt: { text: "seabird SQLite WAL" } });
    await tools.get("uranium_checkpoint").execute({ action: "save", state: { goal: "Implement WAL", next: ["Run database tests"] } }, { sessionID: "s" });
    const event = { sessionID: "s", messages: [], system: [] as any[], model: { providerID: "fixture", model: "fixture" } };
    await hooks.context(event);
    expect(JSON.stringify(event.system)).toContain("seabird project requires SQLite WAL");
    expect(JSON.stringify(event.system)).toContain("Run database tests");
    const compact = { sessionID: "s", system: [] as any[] }; await hooks.compaction(compact);
    expect(JSON.stringify(compact.system)).toContain("Run database tests");
    const foreign = { ...event, sessionID: "foreign", system: [] }; await hooks.context(foreign); expect(foreign.system).toHaveLength(0);
    await expect(tools.get("uranium_memory").execute({ action: "capture", scope: "user", summary: "personal" }, { sessionID: "s" })).rejects.toThrow("operator");
    await cleanup?.(); cleanup = undefined; expect(disposed).toBe(7);
  } finally {
    await cleanup?.();
    if (original === undefined) delete process.env.URANIUM_HOME; else process.env.URANIUM_HOME = original;
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);
