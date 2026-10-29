import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { skills } from "../src/skills.ts";
for (const skill of skills) {
  const directory = resolve(import.meta.dir, "../assets/skills", skill.name); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "SKILL.md"), `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}\n`);
}
console.log(`Generated ${skills.length} native OpenCode workflow skills.`);
