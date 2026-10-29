import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Memory, projectKey } from "../src/memory.ts";
const root = resolve(import.meta.dir, "..");
const installedPackage = resolve(root, "runtime/native-host/node_modules/@opencode/cli");
const installedManifest = resolve(installedPackage, "package.json");
const installedHost = existsSync(installedManifest) ? resolve(installedPackage, JSON.parse(readFileSync(installedManifest, "utf8")).bin.opencode) : "";
const executable = process.env.OPENCODE_BIN || process.env.URANIUM_TEST_EXECUTABLE || (existsSync(installedHost) ? installedHost : Bun.which(process.platform === "win32" ? "opencode.exe" : "opencode"));
if (!executable) throw new Error("Set OPENCODE_BIN to the OpenCode 2.2.1 executable for this optional native-host check.");
const pluginRoot = process.env.URANIUM_TEST_PLUGIN || root;
const port = 19392;
mkdirSync(resolve(root, "artifacts"), { recursive: true });
mkdirSync(resolve(root, "runtime/config"), { recursive: true });
const probeOutput = resolve(root, "artifacts/native-context-probe.json");
if (existsSync(probeOutput)) unlinkSync(probeOutput);
writeFileSync(resolve(root, "runtime/config/opencode.json"), JSON.stringify({ plugins: [pluginRoot.replaceAll("\\", "/"), resolve(root, "test/fixtures/probe").replaceAll("\\", "/")] }));
const memory = new Memory(projectKey(root), resolve(root, "runtime/test-data"));
await memory.call("capture", { summary: "The seabird native context probe uses SQLite WAL journaling." });
for (const card of (await memory.call("review")).cards) await memory.call("approve", { id: card.candidate_id, revision: card.review_revision });
const child = Bun.spawn([executable, "serve", "--hostname", "127.0.0.1", "--port", String(port), "--print-logs"], {
  cwd: root, env: { ...process.env, OPENCODE_CONFIG_DIR: resolve(root, "runtime/config"), URANIUM_HOME: resolve(root, "runtime/test-data"), URANIUM_PROBE_OUTPUT: probeOutput },
  stdout: "pipe", stderr: "pipe",
});
let password = "", stdout = "";
const output = (async () => { for await (const chunk of child.stdout) {
  const text = new TextDecoder().decode(chunk); stdout += text;
  password = stdout.match(/server password (\S+)/)?.[1] ?? password;
} })();
const errors = new Response(child.stderr).text();
const base = `http://127.0.0.1:${port}`;
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "x-opencode-directory": root, authorization: "Basic " + Buffer.from("opencode:" + password).toString("base64") }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}
try {
  for (let attempt = 0; ; attempt++) {
    try { await request("/api/info"); break; } catch (error) { if (attempt > 60) throw error; await Bun.sleep(200); }
  }
  const session = await request("/api/session", "POST", {});
  await Bun.sleep(1200);
  let commands: any, plugins: any;
  for (let attempt = 0; attempt < 30; attempt++) {
    commands = await request("/api/command"); plugins = await request("/api/plugin");
    if (JSON.stringify(commands).includes("uranium-plan")) break;
    await Bun.sleep(500);
  }
  writeFileSync(resolve(root, "artifacts/host-smoke.json"), JSON.stringify({ session, commands, plugins }, null, 2));
  const serialized = JSON.stringify(commands);
  if (!serialized.includes("uranium-plan") || !serialized.includes("uranium-status")) throw new Error("Uranium commands did not register");
  await request(`/api/session/${session.data.id}/model`, "POST", { model: { providerID: "uranium-probe", id: "context-probe" } });
  await request(`/api/session/${session.data.id}/prompt`, "POST", { text: "Recall the seabird SQLite WAL journaling requirement." });
  for (let attempt = 0; !existsSync(probeOutput); attempt++) {
    if (attempt > 80) throw new Error("Native context probe never reached dispatch boundary");
    await Bun.sleep(250);
  }
  const probe = JSON.parse(readFileSync(probeOutput, "utf8"));
  if (!JSON.stringify(probe.system).includes("seabird native context probe uses SQLite")) throw new Error("Real host context did not receive reviewed memory");
  console.log("Native OpenCode host registered Uranium and delivered real reviewed memory into its context hook. Test stopped before model dispatch.");
} finally {
  child.kill(); await child.exited;
  await output;
  writeFileSync(resolve(root, "artifacts/host-stdout.log"), stdout.replace(/server password \S+/g, "server password [ephemeral, redacted]"));
  writeFileSync(resolve(root, "artifacts/host-stderr.log"), await errors);
}
