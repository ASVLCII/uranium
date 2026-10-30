import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function assertSafe(text: string) {
  if (text.length > 12000) throw new Error("State exceeds 12000 characters");
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})|(?:api[_-]?key|password|access[_-]?token)["']?\s*[:=]\s*["']?[^\s"']{8,}/i.test(text))
    throw new Error("Credential-like material cannot be saved as task state");
}
export class State {
  private connection?: Database;
  private closed = false;
  constructor(readonly directory: string) {}
  get db() {
    if (this.closed) throw new Error("Uranium state is closed");
    if (!this.connection) {
      mkdirSync(this.directory, { recursive: true });
      const connection = new Database(join(this.directory, "continuity.sqlite"), { create: true });
      try { connection.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY, session TEXT, kind TEXT, value TEXT, created TEXT)"); }
      catch (error) { connection.close(true); throw error; }
      this.connection = connection;
    }
    return this.connection;
  }
  put(key: string, value: unknown) {
    const json = JSON.stringify(value); assertSafe(json);
    this.db.query("INSERT INTO state VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated").run(key, json, new Date().toISOString());
  }
  get<T = any>(key: string): T | undefined {
    const row = this.db.query("SELECT value FROM state WHERE key=?").get(key) as { value: string } | null;
    return row ? JSON.parse(row.value) : undefined;
  }
  receipt(session: string, kind: string, value: unknown) {
    const json = JSON.stringify(value); assertSafe(json);
    this.db.transaction(() => {
      this.db.query("INSERT INTO receipts(session,kind,value,created) VALUES(?,?,?,?)").run(session, kind, json, new Date().toISOString());
      this.db.exec("DELETE FROM receipts WHERE id <= (SELECT COALESCE(MAX(id),0)-1000 FROM receipts)");
    })();
  }
  recent(session: string) { return this.db.query("SELECT kind,value,created FROM receipts WHERE session=? ORDER BY id DESC LIMIT 12").all(session); }
  saveHandoff(id: string, value: unknown) {
    this.db.transaction(() => {
      this.put(`handoff:${id}`, value);
      this.db.exec("DELETE FROM state WHERE key GLOB 'handoff:*' AND key NOT IN (SELECT key FROM state WHERE key GLOB 'handoff:*' ORDER BY updated DESC,rowid DESC LIMIT 20)");
    })();
  }
  handoffs() {
    return (this.db.query("SELECT value FROM state WHERE key GLOB 'handoff:*' ORDER BY updated DESC,rowid DESC LIMIT 20").all() as { value: string }[]).map(row => {
      const record = JSON.parse(row.value);
      return { id: record.id, sourceSession: record.sourceSession, createdAt: record.createdAt, goal: String(record.checkpoint?.goal ?? "").slice(0, 240) };
    });
  }
  observeTool(session: string, observation: Record<string, unknown>) {
    this.db.transaction(() => {
      const previous = this.get(`recovery:${session}`);
      const pending = new Map<string, { callID: string; name: string }>((previous?.pending ?? []).map((entry: any) => [entry.callID, entry]));
      const callID = String(observation.callID ?? "").slice(0, 96), name = String(observation.name ?? "").slice(0, 80);
      let overflow = previous?.pendingOverflow === true;
      if (observation.status === "started") {
        if (pending.size < 32 || pending.has(callID)) pending.set(callID, { callID, name });
        else overflow = true;
      } else pending.delete(callID);
      this.put(`recovery:${session}`, { ...observation, callID, name, pending: [...pending.values()], pendingOverflow: overflow,
        observedAt: new Date().toISOString(), meaning: "tool observation, not proof of task completion; reconcile interrupted work before retrying" });
      this.receipt(session, "tool", observation);
    })();
  }
  recoveryNote(session: string, excludeCallID?: string) {
    const record = this.get(`recovery:${session}`);
    const pending = Array.isArray(record?.pending) ? record.pending.filter((entry: any) => entry.callID !== excludeCallID) : [];
    const observation = excludeCallID && record?.callID === excludeCallID ? { observedAt: record.observedAt, pendingOverflow: record.pendingOverflow, meaning: record.meaning } : record;
    return record ? { ...observation, pendingCount: pending.length, pending: pending.slice(0, 4), pendingListTruncated: pending.length > 4 } : undefined;
  }
  close() { if (this.closed) return; this.closed = true; this.connection?.close(true); this.connection = undefined; }
}
