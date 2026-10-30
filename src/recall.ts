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

/** On-demand diagnostics only. Excluded records expose IDs/reasons, never their summaries. */
export function explainRecall(result: ReturnType<typeof renderRecall>) {
  const delivered = result.text ? result.text.split("\n").map(line => JSON.parse(line)) : [];
  const selected = new Set(delivered.map(record => JSON.stringify([record.scope.kind, record.scope.ref, record.id])));
  const scopes = result.packs.map(pack => {
    const included = Array.isArray(pack.included_records) ? pack.included_records : [];
    const excluded = Array.isArray(pack.excluded_records) ? pack.excluded_records : [];
    const reasons: Record<string, number> = Object.create(null);
    for (const record of excluded) {
      const reason = text(record.reason, 80) || "not_reported";
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
    return { scope: { kind: text(pack.scope?.kind, 24), ref: text(pack.scope?.ref) }, intent: text(pack.query_intent, 48),
      engineIncluded: included.length, engineExcluded: excluded.length, exclusionCounts: reasons,
      candidates: included.slice(0, 12).map(record => {
        const projected = project(record);
        return { id: projected.id, disposition: selected.has(JSON.stringify([projected.scope.kind, projected.scope.ref, projected.id])) ? "delivered" : "adapter_budget_cut",
          eligibility: text(record.eligibility_reason, 80) || "not_reported", freshness: projected.freshness,
          ranking: Object.fromEntries(["relevance_rank", "recency_rank", "usage_rank", "rrf_score_micro", "pinned"].flatMap(key => {
            const value = record.ranking?.[key]; return typeof value === "number" || typeof value === "boolean" ? [[key, value]] : [];
          })) };
      }),
      excluded: excluded.slice(0, 20).map(record => ({ id: text(record.record_id), reason: text(record.reason, 80), duplicateOf: text(record.duplicate_of) || undefined })),
      excludedListTruncated: excluded.length > 20,
    };
  });
  return { budget: RECALL_BUDGET, deliveredCharacters: result.text.length, deliveredCount: result.count, delivered, scopes,
    limits: "Fresh evaluation of approved stores, not a replay of an earlier model request. Empty stores are omitted. Engine exclusion lists may be bounded; pending review candidates are not delivered. Rankings apply within each scope, not across scopes." };
}
