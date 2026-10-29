import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, ".."); mkdirSync(resolve(root, "dist"), { recursive: true });
for (const [input, name, external] of [
  ["src/server.ts", "server", []], ["src/tui.ts", "tui", ["@opentui/core"]],
  ["scripts/manage.ts", "manage", []], ["scripts/configure.ts", "configure", []], ["src/memory.ts", "memory", []],
] as [string, string, string[]][]) {
  const result = await Bun.build({ entrypoints: [resolve(root, input)], target: ["manage", "memory"].includes(name) ? "node" : "bun", external, naming: `${name}.js`, outdir: resolve(root, "dist") });
  if (!result.success) throw new Error(result.logs.join("\n"));
}
console.log("Built compact Uranium runtime bundles. Native OpenTUI core is provided by the pinned OpenCode host.");
