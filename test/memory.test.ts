import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Memory, projectKey } from "../src/memory.ts";
import { State } from "../src/state.ts";

test("real OMH capture requires immutable review, survives restart and isolates projects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-memory-"));
  try {
    const a = new Memory("repo:" + "a".repeat(32), directory), b = new Memory("repo:" + "b".repeat(32), directory);
    const captured = await a.call("capture", { summary: "The seabird database uses WAL journaling for concurrency." });
    expect(captured.auto_approved).toBe(false);
    expect((await a.recall("seabird database WAL", "test")).count).toBe(0);
    const review = await a.call("review"), card = review.cards[0];
    expect(card.review_revision).toBeTruthy();
    await expect(a.call("approve", { id: card.candidate_id, revision: "stale" })).rejects.toThrow();
    await a.call("approve", { id: card.candidate_id, revision: card.review_revision });
    const restarted = new Memory(a.project, directory);
    const recall = await restarted.recall("seabird database WAL", "test");
    expect(recall.text).toContain("seabird"); expect(recall.text.length).toBeLessThanOrEqual(3500);
    expect((await b.recall("seabird database WAL", "test")).count).toBe(0);
    const userCapture = await a.call("capture", { scope: "user", summary: "The operator prefers seabird diagrams for architecture notes." });
    expect(userCapture.auto_approved).toBe(false);
    const userCard = (await a.call("review", { scope: "user" })).cards[0];
    await a.call("approve", { scope: "user", id: userCard.candidate_id, revision: userCard.review_revision });
    expect((await b.recall("seabird diagrams", "other-session")).text).toContain("seabird diagrams");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 120000);

test("credential-shaped memories are not admitted for recall", async () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-secret-"));
  try {
    const memory = new Memory("repo:" + "a".repeat(32), directory);
    const result = await memory.call("capture", { summary: "API_KEY=sk-" + "syntheticfixture".repeat(4) });
    expect(result.auto_approved).toBe(false);
    expect((await memory.recall("API_KEY", "test")).count).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30000);

test("checkpoint survives restart and receipts never imply verification", () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-state-"));
  try {
    const state = new State(directory);
    state.put("checkpoint:s", { goal: "finish", next: ["run checks"] });
    state.receipt("s", "tool", { status: "error", exitCode: 1 }); state.close();
    const reopened = new State(directory);
    expect(reopened.get("checkpoint:s").next).toEqual(["run checks"]);
    expect(reopened.recent("s")).toHaveLength(1);
    expect(() => reopened.put("bad", { note: "password=this_is_a_test_secret" })).toThrow("Credential");
    expect(() => reopened.put("bad-json", { password: "this_is_a_test_secret" })).toThrow("Credential");
    reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("repository descendants share canonical memory identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-project-"));
  try { mkdirSync(join(directory, ".git")); mkdirSync(join(directory, "src")); expect(projectKey(directory)).toBe(projectKey(join(directory, "src"))); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
