import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { State, assertSafe } from "./state.ts";
import { validateWorkflow } from "./workflow.ts";

type Revision = { available: boolean; head?: string; dirty?: boolean; statusDigest?: string };
type Witness = { path: string; sha256: string };
export type Handoff = {
  schema: 1; id: string; project: string; sourceSession: string; createdAt: string;
  checkpoint: Record<string, any>; workflow?: any; recovery?: unknown; revision: Revision; files: Witness[];
};
function digest(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
export function revision(root: string): Revision {
  try {
    const output = execFileSync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", root, "status", "--porcelain=v2", "--branch", "--untracked-files=normal"], {
      encoding: "utf8", timeout: 3000, maxBuffer: 131072, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    });
    const head = output.match(/^# branch\.oid ([a-f0-9]{40,64})$/m)?.[1];
    if (!head) return { available: false };
    const status = output.split("\n").filter(line => line && !line.startsWith("# ")).join("\n");
    return { available: true, head, dirty: !!status, statusDigest: digest(status) };
  } catch { return { available: false }; }
}
function witness(root: string, name: string): Witness {
  if (typeof name !== "string" || !name || name.length > 240 || isAbsolute(name) || /^[a-z]:/i.test(name) || name.includes("\\") || name.split("/").some(p => p === ".." || !p))
    throw new Error("Handoff files must be relative forward-slash paths without traversal");
  const base = realpathSync(root), file = realpathSync(resolve(base, name)), local = relative(base, file);
  if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) throw new Error("Handoff file resolves outside this project");
  const descriptor = openSync(file, "r");
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 1_048_576) throw new Error("Each handoff file must be a regular file of at most 1 MiB");
    const hash = createHash("sha256"), buffer = Buffer.allocUnsafe(65536); let total = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, 1_048_577 - total), null);
      if (!count) break;
      total += count; if (total > 1_048_576) throw new Error("Handoff file grew beyond its limit");
      hash.update(buffer.subarray(0, count));
    }
    return { path: name, sha256: hash.digest("hex") };
  } finally { closeSync(descriptor); }
}
function checkpoint(value: any): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.goal !== "string" || !Array.isArray(value.next) || !value.next.every((entry: unknown) => typeof entry === "string"))
    throw new Error("Save a structured checkpoint with goal and next actions before creating a handoff");
}
export function createHandoff(state: State, project: string, root: string, session: string, files: string[] = [], currentCallID?: string) {
  if (!Array.isArray(files) || files.length > 8 || new Set(files).size !== files.length) throw new Error("Select at most 8 distinct handoff files");
  const progress = state.get(`checkpoint:${session}`); checkpoint(progress);
  const workflow = state.get(`workflow:${session}`); if (workflow) validateWorkflow(workflow);
  const result: Handoff = { schema: 1, id: randomUUID(), project, sourceSession: session, createdAt: new Date().toISOString(),
    checkpoint: progress, ...(workflow ? { workflow } : {}), recovery: state.recoveryNote(session, currentCallID), revision: revision(root), files: files.map(file => witness(root, file)) };
  assertSafe(JSON.stringify(result));
  state.saveHandoff(result.id, result);
  return result;
}
export function inspectHandoff(state: State, id: string, project: string, root: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid handoff ID");
  const value = state.get<Handoff>(`handoff:${id}`);
  if (!value || value.schema !== 1 || value.id !== id || value.project !== project) throw new Error("Handoff not found in this project");
  checkpoint(value.checkpoint); if (value.workflow) validateWorkflow(value.workflow);
  if (!Array.isArray(value.files) || value.files.length > 8) throw new Error("Invalid handoff file list");
  const current = revision(root), reasons: string[] = [], files = value.files.map(previous => {
    try { return { path: previous.path, unchanged: witness(root, previous.path).sha256 === previous.sha256 }; }
    catch { return { path: previous.path, unchanged: false }; }
  });
  const recovery = value.recovery as { pendingCount?: number; pendingOverflow?: boolean } | undefined;
  if (recovery?.pendingCount || recovery?.pendingOverflow) reasons.push("Source session had unfinished tool calls; reconcile their side effects before retrying");
  if (!value.revision.available || !current.available) reasons.push("Git revision could not be checked");
  else {
    if (value.revision.head !== current.head) reasons.push("Git HEAD changed");
    if (value.revision.statusDigest !== current.statusDigest) reasons.push("Git working-tree status changed");
    if (value.revision.dirty || current.dirty) reasons.push("Uncommitted or untracked work requires review; status alone does not fingerprint its contents");
  }
  for (const file of files) if (!file.unchanged) reasons.push(`Selected file changed or is unavailable: ${file.path}`);
  return { handoff: value, review: { status: reasons.length ? "requires_review" : "no_drift_observed", reasons, files,
    limits: "Git revision/status and selected file hashes only; ignored files, dependencies and external systems are not verified. Saved completed work remains a historical claim." } };
}
export function adoptHandoff(state: State, id: string, project: string, root: string, session: string, replace = false) {
  const result = inspectHandoff(state, id, project, root), source = result.handoff;
  if (source.sourceSession === session) throw new Error("Use the current checkpoint to resume this session; handoff adoption is for a different session");
  const imported = { ...source.checkpoint, completed: [], savedAt: new Date().toISOString(), handoff: {
    id, sourceSession: source.sourceSession, createdAt: source.createdAt, review: result.review,
    reportedCompleted: source.checkpoint.completed ?? [], recovery: source.recovery,
    meaning: "Historical handoff: reconcile saved claims and unfinished side effects before executing next actions. No completed work has been independently verified for this session.",
  } };
  assertSafe(JSON.stringify(imported));
  state.db.transaction(() => {
    if (!replace && (state.get(`checkpoint:${session}`) || state.get(`workflow:${session}`))) throw new Error("This session already has progress; inspect it before explicitly setting replace=true");
    state.put(`checkpoint:${session}`, imported);
    if (source.workflow) state.put(`workflow:${session}`, source.workflow);
    else if (replace) state.put(`workflow:${session}`, null);
  })();
  return { adopted: id, review: result.review, next: source.checkpoint.next, meaning: imported.handoff.meaning };
}
