import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { State } from "../src/state.ts";
import { createHandoff, inspectHandoff, adoptHandoff } from "../src/handoff.ts";
import { projectKey } from "../src/memory.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "uranium-handoff-")), root = join(directory, "repo"); mkdirSync(root);
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  git("init"); git("config", "user.name", "ASVLCII"); git("config", "user.email", "nguyen.xuan.bao.nguyen.2013@gmail.com");
  writeFileSync(join(root, "code.txt"), "baseline\n"); git("add", "code.txt"); git("commit", "-m", "fixture");
  const state = new State(join(directory, "state")), project = projectKey(root);
  state.put("checkpoint:source", { goal: "Finish the fixture", completed: ["baseline check reportedly passed"], next: ["check behavior"], blockers: [] });
  return { directory, root, git, state, project, close: () => { state.close(); rmSync(directory, { recursive: true, force: true }); } };
}
test("handoff survives restart, checks content drift and never adopts completed-work claims as verified", () => {
  const f = fixture();
  try {
    f.state.observeTool("source", { callID: "pending", name: "shell", status: "started" });
    f.state.observeTool("source", { callID: "handoff-call", name: "uranium_handoff", status: "started" });
    f.state.put("workflow:source", { name: "fixture", tasks: [{ id: "a", description: "check behavior", writes: ["code.txt"], dependsOn: [], verify: ["run checks"] }] });
    const created = createHandoff(f.state, f.project, f.root, "source", ["code.txt"], "handoff-call");
    expect(JSON.stringify(created.recovery)).not.toContain("handoff-call");
    f.state.close(); const reopened = new State(join(f.directory, "state"));
    try {
      const inspected = inspectHandoff(reopened, created.id, f.project, f.root);
      expect(inspected.review.status).toBe("requires_review");
      expect(inspected.review.reasons.join(" ")).toContain("unfinished tool calls");
      writeFileSync(join(f.root, "code.txt"), "changed\n");
      const result = adoptHandoff(reopened, created.id, f.project, f.root, "destination");
      expect(result.review.status).toBe("requires_review"); expect(result.review.files[0].unchanged).toBe(false);
      const adopted = reopened.get("checkpoint:destination");
      expect(adopted.completed).toEqual([]); expect(adopted.handoff.reportedCompleted).toEqual(["baseline check reportedly passed"]);
      expect(JSON.stringify(adopted.handoff.recovery)).toContain("pending");
      expect(reopened.get("recovery:destination")).toBeUndefined();
      expect(reopened.get("workflow:destination").name).toBe("fixture");
      expect(() => adoptHandoff(reopened, created.id, f.project, f.root, "destination")).toThrow("already has progress");
      expect(() => inspectHandoff(reopened, created.id, "repo:foreign", f.root)).toThrow("not found");
    } finally { reopened.close(); }
  } finally { f.close(); }
});
test("handoff detects a changed commit and warns about dirty contents even when Git status stays identical", () => {
  const f = fixture();
  try {
    const clean = createHandoff(f.state, f.project, f.root, "source", ["code.txt"]);
    expect(inspectHandoff(f.state, clean.id, f.project, f.root).review.status).toBe("no_drift_observed");
    writeFileSync(join(f.root, "code.txt"), "first edit\n");
    const created = createHandoff(f.state, f.project, f.root, "source");
    writeFileSync(join(f.root, "code.txt"), "another edit\n");
    expect(inspectHandoff(f.state, created.id, f.project, f.root).review.reasons.join(" ")).toContain("Uncommitted");
    f.git("add", "code.txt"); f.git("commit", "-m", "changed fixture");
    expect(inspectHandoff(f.state, created.id, f.project, f.root).review.reasons).toContain("Git HEAD changed");
  } finally { f.close(); }
});

test("handoff without a Git revision requires review and replacement clears an unrelated workflow", () => {
  const directory = mkdtempSync(join(tmpdir(), "uranium-handoff-no-git-")), state = new State(join(directory, "state"));
  try {
    state.put("checkpoint:source", { goal: "resume", next: ["inspect"] });
    const created = createHandoff(state, "repo:p", directory, "source");
    state.put("workflow:destination", { name: "old", tasks: [] });
    const result = adoptHandoff(state, created.id, "repo:p", directory, "destination", true);
    expect(result.review.status).toBe("requires_review");
    expect(result.review.reasons).toContain("Git revision could not be checked");
    expect(state.get("workflow:destination")).toBeNull();
  } finally { state.close(); rmSync(directory, { recursive: true, force: true }); }
});
test("handoff rejects traversal, external links, oversized files and snapshots, and retains only 20 recent entries", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, "external.txt"), "outside\n");
    expect(() => createHandoff(f.state, f.project, f.root, "source", ["../external.txt"])).toThrow("relative");
    mkdirSync(join(f.directory, "outside")); writeFileSync(join(f.directory, "outside", "external.txt"), "outside\n");
    symlinkSync(join(f.directory, "outside"), join(f.root, "link"), process.platform === "win32" ? "junction" : "dir");
    expect(() => createHandoff(f.state, f.project, f.root, "source", ["link/external.txt"])).toThrow("outside");
    writeFileSync(join(f.root, "large.txt"), Buffer.alloc(1_048_577));
    expect(() => createHandoff(f.state, f.project, f.root, "source", ["large.txt"])).toThrow("1 MiB");
    f.state.put("checkpoint:too-large", { goal: "g".repeat(11700), next: ["check"] });
    expect(() => createHandoff(f.state, f.project, f.root, "too-large")).toThrow("12000");
    for (let i = 0; i < 25; i++) f.state.saveHandoff(String(i), { id: String(i), sourceSession: "s", createdAt: "fixture", checkpoint: { goal: "g" } });
    expect(f.state.handoffs()).toHaveLength(20); expect(f.state.handoffs()[0].id).toBe("24");
    expect(f.state.get("checkpoint:source").goal).toBe("Finish the fixture");
  } finally { f.close(); }
});
