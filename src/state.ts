import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function assertSafe(text: string) {
  if (text.length > 12000) throw new Error("State exceeds 12000 characters");
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})|(?:api[_-]?key|password|access[_-]?token)["']?\s*[:=]\s*["']?[^\s"']{8,}/i.test(text))
    throw new Error("Credential-like material cannot be saved as task state");
}
export class State {
  readonly db: Database;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new Database(join(directory, "continuity.sqlite"), { create: true });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY, session TEXT, kind TEXT, value TEXT, created TEXT)");
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
  close() { this.db.close(true); }
}
