#!/usr/bin/env node
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { parse, modify, applyEdits } from "jsonc-parser";
import { Memory, projectKey, DEFAULT_PYTHON, DEFAULT_HOME } from "../dist/memory.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const [command = "--help", ...args] = process.argv.slice(2);
function flag(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
try {
  if (command === "--version" || command === "-v") console.log(`Uranium ${version}`);
  else if (command === "memory") await import("../dist/manage.js");
  else if (command === "doctor") {
    const memory = new Memory(projectKey(process.cwd()));
    await memory.call("review");
    console.log(JSON.stringify({ uranium: version, engine: "4.0.3+uranium.3", python: memory.python, engineReady: true, data: memory.data, koiRequired: false }, null, 2));
  } else if (command === "setup") {
    const known = new Set(["--config-dir", "--koi", "--no-theme"]);
    for (let i = 0; i < args.length; i++) {
      if (!known.has(args[i])) throw new Error(`Unknown setup option: ${args[i]}`);
      if (args[i] !== "--no-theme") { flag(args[i]); i++; }
    }
    const config = resolve(flag("--config-dir") || process.env.OPENCODE_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode"));
    mkdirSync(config, { recursive: true });
    const backup = join(config, "backups", `uranium-${Date.now()}-${process.pid}`); mkdirSync(backup, { recursive: true });
    function edit(filename, key, value, append = false) {
      const path = join(config, filename), text = existsSync(path) ? readFileSync(path, "utf8") : "{}\n";
      const errors = [], document = parse(text, errors, { allowTrailingComma: true });
      if (errors.length || !document || typeof document !== "object" || Array.isArray(document)) throw new Error(`Invalid JSONC: ${path}`);
      if (append && document[key] !== undefined && !Array.isArray(document[key])) throw new Error(`${key} must be an array in ${path}`);
      if (append && key === "plugins" && document.plugin !== undefined && !Array.isArray(document.plugin)) throw new Error(`Legacy plugin must be an array in ${path}`);
      if (!existsSync(join(backup, filename))) writeFileSync(join(backup, filename), text);
      const next = append ? [...new Set([...(key === "plugins" ? document.plugin || [] : []), ...(document[key] || []), value])] : value;
      let updated = applyEdits(text, modify(text, [key], next, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
      if (append && key === "plugins" && document.plugin !== undefined) updated = applyEdits(updated, modify(updated, ["plugin"], undefined, {}));
      writeFileSync(path, updated);
    }
    const server = existsSync(join(config, "opencode.jsonc")) ? "opencode.jsonc" : "opencode.json";
    const cli = existsSync(join(config, "cli.jsonc")) ? "cli.jsonc" : "cli.json";
    edit(server, "plugins", root.replaceAll("\\", "/"), true);
    if (!args.includes("--no-theme")) {
      const themes = join(config, "themes"); mkdirSync(themes, { recursive: true });
      if (existsSync(join(themes, "uranium.json"))) copyFileSync(join(themes, "uranium.json"), join(backup, "uranium-theme.json"));
      copyFileSync(join(root, "assets/uranium-theme.json"), join(themes, "uranium.json"));
      edit(cli, "theme", { name: "uranium", mode: "dark" });
    }
    const koi = flag("--koi");
    if (koi) {
      const entry = koi.startsWith(".") || isAbsolute(koi) ? resolve(koi).replaceAll("\\", "/") : koi;
      edit(cli, "plugins", entry, true);
    }
    console.log(`Uranium configured. Restart OpenCode and use /memory.\nConfiguration: ${config}\nBackup: ${backup}\n${koi ? "Koi explicitly enabled." : "No koi installed or added. Existing plugins were preserved."}`);
  } else if (command === "--help" || command === "-h" || command === "help") {
    console.log(`Uranium ${version} — OpenCode plugin\n\nuranium setup [--config-dir PATH] [--no-theme] [--koi ENTRY]\nuranium doctor\nuranium memory help\n\nRequires OpenCode 2.2.1 and Python 3.11+. Default Python: ${DEFAULT_PYTHON}.\nDefault data: ${DEFAULT_HOME}\nKoi is separate and opt-in. Setup never downloads it. Start OpenCode after setup.`);
  } else throw new Error(`Unknown command: ${command}. Run uranium --help.`);
} catch (error) { console.error(`Uranium: ${error.message}`); process.exitCode = 1; }
