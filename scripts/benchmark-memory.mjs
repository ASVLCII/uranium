import { performance } from "node:perf_hooks";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = resolve(process.argv[2] || "runtime/github-install-v020/node_modules/@asvlcii/uranium");
const oldVersion = JSON.parse(readFileSync(join(baseline, "package.json"))).version;
const version = JSON.parse(readFileSync(join(root, "package.json"))).version;
assert.notEqual(oldVersion, version, "Use a separately installed prior version");
let launches = 0;
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (...args) {
  if (args[1]?.some(arg => String(arg).endsWith("memory_bridge.py"))) launches++;
  return originalSpawn.apply(this, args);
};
syncBuiltinESMExports();
const { Memory: Previous } = await import(pathToFileURL(join(baseline, "dist/memory.js")).href);
const { Memory: Current } = await import(pathToFileURL(join(root, "dist/memory.js")).href);
const temporary = mkdtempSync(join(tmpdir(), "uranium-benchmark-"));
const key = "repo:" + "a".repeat(32);
const rows = [];
async function sample(label, Class, data) {
  const memory = new Class(key, data); const before = launches, started = performance.now();
  const recalled = await memory.recall("seabird SQLite architecture", "benchmark");
  const elapsedMs = performance.now() - started;
  rows.push({ version: label, scenario: data.endsWith("populated") ? "populated" : "empty", elapsedMs, bridgeLaunches: launches - before, characters: recalled.text.length, count: recalled.count });
  return recalled.text ? recalled.text.split("\n").map(line => JSON.parse(line).id).sort() : [];
}
try {
  const populated = join(temporary, "populated"), seed = new Previous(key, populated);
  for (const [scope, summary] of [["project", "The seabird SQLite database uses WAL journaling."], ["user", "The operator prefers seabird architecture diagrams."]]) {
    await seed.call("capture", { scope, summary });
    const card = (await seed.call("review", { scope })).cards[0];
    await seed.call("approve", { scope, id: card.candidate_id, revision: card.review_revision });
  }
  for (let repetition = 0; repetition < 3; repetition++) {
    for (const scenario of ["empty", "populated"]) {
      const data = scenario === "populated" ? populated : join(temporary, `empty-${repetition}`);
      const oldIDs = await sample(oldVersion, Previous, data), newIDs = await sample(version, Current, data);
      assert.deepEqual(newIDs, oldIDs, "Selected evidence differs on the equivalent fixture");
    }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = [];
  for (const scenario of ["empty", "populated"]) for (const label of [oldVersion, version]) {
    const values = rows.filter(row => row.version === label && row.scenario === scenario);
    summary.push({ scenario, version: label, runs: values.length, medianMs: Math.round(median(values.map(row => row.elapsedMs)) * 100) / 100,
      bridgeLaunchesPerRequest: median(values.map(row => row.bridgeLaunches)) });
  }
  const report = { environment: { platform: process.platform, node: process.version, python: process.env.URANIUM_MEMORY_PYTHON || "platform default" },
    equivalentSelectedIDs: true, limitations: "Three local samples per condition; retrieval path only. No model-quality, total RAM or CPU claim. New output additionally retains provenance and uncertainty.",
    serverBytes: { previous: statSync(join(baseline, "dist/server.js")).size, current: statSync(join(root, "dist/server.js")).size }, summary, samples: rows };
  mkdirSync(join(root, "artifacts"), { recursive: true }); writeFileSync(join(root, "artifacts/resource-benchmark.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ serverBytes: report.serverBytes, summary, equivalentSelectedIDs: true }, null, 2));
} finally {
  childProcess.spawn = originalSpawn; syncBuiltinESMExports(); rmSync(temporary, { recursive: true, force: true });
}
