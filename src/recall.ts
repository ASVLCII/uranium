export const RECALL_BUDGET = 3500;
type RecordData = Record<string, any>;
function text(value: unknown, limit = 160) { return typeof value === "string" ? value.slice(0, limit) : ""; }
function project(record: RecordData) {
  const freshness: RecordData = {};
  if (record.staleness && typeof record.staleness === "object") {
    for (const [key, value] of Object.entries(record.staleness).slice(0, 12)) {
      if (typeof value === "string") freshness[key] = text(value);
      else if (typeof value === "number" || typeof value === "boolean" || value === null) freshness[key] = value;
    }
  }
  return {
    id: text(record.record_id), summary: text(record.summary, 500), type: text(record.record_type, 24),
    scope: { kind: text(record.scope?.kind, 24), ref: text(record.scope?.ref) },
    ...(text(record.source) ? { source: text(record.source) } : {}),
    ...(text(record.approved_at) ? { approved_at: text(record.approved_at, 48) } : {}),
    revision: Number.isSafeInteger(record.revision) ? record.revision : undefined,
    ...(text(record.resolution) ? { resolution: text(record.resolution) } : {}),
    ...(text(record.resolution_marker) ? { resolution_marker: text(record.resolution_marker) } : {}),
    ...(Object.keys(freshness).length ? { freshness } : {}),
  };
}
/** Interleave canonical per-scope rankings; never compare incomparable scores across stores. */
export function renderRecall(packs: RecordData[], budget = RECALL_BUDGET) {
  const queues = packs.map(pack => Array.isArray(pack.included_records) ? pack.included_records.map(project) : []);
  const lines: string[] = []; let used = 0;
  for (let position = 0; position < Math.max(0, ...queues.map(q => q.length)); position++) {
    for (const queue of queues) {
      const record = queue[position]; if (!record) continue;
      const line = JSON.stringify(record), needed = line.length + (lines.length ? 1 : 0);
      if (used + needed > budget) continue;
      lines.push(line); used += needed;
    }
  }
  return { text: lines.join("\n"), count: lines.length, packs };
}
