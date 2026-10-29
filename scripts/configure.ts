import { parse, modify, applyEdits, type ParseError } from "jsonc-parser";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
const [source, destination, plugin] = process.argv.slice(2);
if (!source || !destination || !plugin) throw new Error("Usage: configure <existing-config-dir> <new-config-dir> <plugin-directory>");
if (resolve(source) === resolve(destination)) throw new Error("Use a separate Uranium config directory");
mkdirSync(destination, { recursive: true });
for (const file of ["opencode.json", "opencode.jsonc", "cli.json", "cli.jsonc"]) {
  const from = join(source, file), to = join(destination, file);
  if (existsSync(from) && !existsSync(to)) copyFileSync(from, to);
}
function extend(file: string, key: string, value: unknown, append = false) {
  const path = join(destination, file), text = existsSync(path) ? readFileSync(path, "utf8") : "{}\n";
  const errors: ParseError[] = []; const document = parse(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`Cannot safely edit ${path}: invalid JSONC`);
  const next = append ? [...new Set([...(document[key] ?? []), value])] : value;
  writeFileSync(path, applyEdits(text, modify(text, [key], next, { formattingOptions: { insertSpaces: true, tabSize: 2 } })));
}
const server = existsSync(join(destination, "opencode.jsonc")) ? "opencode.jsonc" : "opencode.json";
const cli = existsSync(join(destination, "cli.jsonc")) ? "cli.jsonc" : "cli.json";
extend(server, "plugins", plugin.replaceAll("\\", "/"), true);
extend(cli, "plugins", plugin.replaceAll("\\", "/"), true);
extend(cli, "theme", { name: "uranium", mode: "dark" });
mkdirSync(join(destination, "themes"), { recursive: true });
copyFileSync(resolve(import.meta.dir, "../assets/uranium-theme.json"), join(destination, "themes/uranium.json"));
console.log(`Prepared Uranium config: ${destination}. Existing OpenCode configuration preserved at ${source}.`);
