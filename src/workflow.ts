export interface Task { id: string; description: string; writes: string[]; dependsOn: string[]; verify: string[] }
export interface Workflow { name: string; tasks: Task[] }
function prefix(pattern: string) {
  if (!pattern || pattern.startsWith("/") || /^[a-z]:/i.test(pattern) || pattern.includes("\\") || pattern.split("/").includes(".."))
    throw new Error("Write scopes must be relative forward-slash paths without traversal");
  return pattern.toLowerCase().split(/[?*\[{]/, 1)[0].replace(/\/$/, "");
}
export function overlaps(a: string, b: string) {
  const x = prefix(a), y = prefix(b);
  if (/[?*\[{]/.test(a) || /[?*\[{]/.test(b)) return x.startsWith(y) || y.startsWith(x);
  return x === y || x.startsWith(y + "/") || y.startsWith(x + "/");
}
export function validateWorkflow(plan: Workflow): string[][] {
  if (!plan || typeof plan.name !== "string" || !plan.name.trim() || !Array.isArray(plan.tasks) || !plan.tasks.length || plan.tasks.length > 30)
    throw new Error("A workflow needs a name and 1–30 tasks");
  const tasks = new Map<string, Task>();
  for (const task of plan.tasks) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(task.id) || tasks.has(task.id)) throw new Error("Invalid or duplicate task ID");
    if (!task.description?.trim() || !Array.isArray(task.writes) || !Array.isArray(task.dependsOn) || !Array.isArray(task.verify) || !task.verify.length)
      throw new Error("Each task needs a description, write scopes, dependencies and verification commands");
    task.writes.forEach(prefix); tasks.set(task.id, task);
  }
  const ancestors = new Map<string, Set<string>>(), visiting = new Set<string>();
  function walk(id: string): Set<string> {
    if (visiting.has(id)) throw new Error("Dependency cycle");
    if (ancestors.has(id)) return ancestors.get(id)!;
    const task = tasks.get(id); if (!task) throw new Error(`Unknown dependency: ${id}`);
    visiting.add(id); const all = new Set<string>();
    for (const dependency of task.dependsOn) { all.add(dependency); for (const parent of walk(dependency)) all.add(parent); }
    visiting.delete(id); ancestors.set(id, all); return all;
  }
  for (const id of tasks.keys()) walk(id);
  for (let i = 0; i < plan.tasks.length; i++) for (let j = i + 1; j < plan.tasks.length; j++) {
    const a = plan.tasks[i], b = plan.tasks[j];
    if (ancestors.get(a.id)!.has(b.id) || ancestors.get(b.id)!.has(a.id)) continue;
    if (a.writes.some(x => b.writes.some(y => overlaps(x, y)))) throw new Error(`Concurrent write overlap: ${a.id} and ${b.id}; add a dependency or separate scopes`);
  }
  const done = new Set<string>(), waves: string[][] = [];
  while (done.size < tasks.size) {
    const wave = plan.tasks.filter(t => !done.has(t.id) && t.dependsOn.every(d => done.has(d))).map(t => t.id);
    if (!wave.length) throw new Error("Unresolvable workflow");
    waves.push(wave); wave.forEach(id => done.add(id));
  }
  return waves;
}
export function workflowInstructions(plan: Workflow) {
  const waves = validateWorkflow(plan);
  return `Execute this validated Uranium workflow using native OpenCode tools. Default to serial execution. Do not create workers unless the user authorizes delegation. Respect permissions, inspect existing edits, stay inside declared write scopes, and stop on a failed prerequisite. Run each task's verification commands; report actual exit/results and remaining limitations. Do not claim a plan or a successful tool invocation proves correctness. Save a checkpoint after each completed task.\n${JSON.stringify({ ...plan, waves }, null, 2)}`;
}
