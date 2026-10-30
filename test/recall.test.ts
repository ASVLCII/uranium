import { test, expect } from "bun:test";
import { renderRecall, explainRecall } from "../src/recall.ts";

test("recall inspection distinguishes engine exclusions from adapter budget cuts without exposing excluded content", () => {
  const included = Array.from({ length: 6 }, (_, index) => ({ record_id: `project-${index}`, summary: "x".repeat(500), record_type: "fact", scope: { kind: "project", ref: "repo:p" }, source: "s".repeat(160), eligibility_reason: "eligible", ranking: { relevance_rank: index + 1 } }));
  const result = renderRecall([{ scope: { kind: "project", ref: "repo:p" }, included_records: included,
    excluded_records: [{ record_id: "expired", reason: "expired", summary: "EXCLUDED CONTENT MUST NOT LEAK" }, { record_id: "prototype", reason: "__proto__" }] }]);
  const report = explainRecall(result);
  expect(report.deliveredCharacters).toBe(result.text.length); expect(report.deliveredCount).toBe(result.count);
  expect(report.scopes[0].candidates.some(record => record.disposition === "adapter_budget_cut")).toBe(true);
  expect(report.scopes[0].exclusionCounts.expired).toBe(1); expect(report.scopes[0].exclusionCounts["__proto__"]).toBe(1);
  expect(JSON.stringify(report)).not.toContain("EXCLUDED CONTENT");
  expect(JSON.stringify(report)).toContain("relevance_rank");
});
function record(id: string, scope: string, summary = "a".repeat(490)) {
  return { record_id: id, scope: { kind: scope, ref: scope }, summary, record_type: "fact", source: "fixture",
    approved_at: "2026-10-30T00:00:00Z", revision: 2, resolution: "unresolved", resolution_marker: "open · 3 days unresolved", staleness: { status: "fresh" } };
}
test("recall preserves uncertainty and provenance and gives both scopes room", () => {
  const project = [1, 2, 3, 4, 5].map(n => record(`p${n}`, "project"));
  const user = [record("u1", "user")];
  const result = renderRecall([{ included_records: project }, { included_records: user }]);
  const rows = result.text.split("\n").map(line => JSON.parse(line));
  expect(result.text.length).toBeLessThanOrEqual(3500);
  expect(rows.map(row => row.id).slice(0, 2)).toEqual(["p1", "u1"]);
  expect(rows[0].resolution_marker).toBe("open · 3 days unresolved");
  expect(rows[0].source).toBe("fixture"); expect(rows[0].revision).toBe(2);
  expect(rows[0].freshness.status).toBe("fresh");
  expect(project[0].summary.length).toBe(490);
});
test("budget includes escaped content and never emits malformed or oversized JSON", () => {
  const result = renderRecall([{ included_records: [record("large", "project", "\u0000".repeat(500)), record("small", "project", "A short fact.")] }], 800);
  expect(result.text.length).toBeLessThanOrEqual(800);
  expect(JSON.parse(result.text).id).toBe("small");
  expect(renderRecall([]).text).toBe("");
});
