import { test, expect } from "bun:test";
import { validateWorkflow, overlaps, type Task } from "../src/workflow.ts";
const task = (id: string, writes: string[], dependsOn: string[] = []): Task => ({ id, description: id, writes, dependsOn, verify: ["bun test"] });
test("unordered ancestor and wildcard ownership conflicts are rejected", () => {
  for (const pair of [["src", "src/api.ts"], ["src/**", "src/a/*"], ["src/a*.ts", "src/api.ts"], ["**/*.ts", "src/api.ts"], ["SRC/api.ts", "src/API.ts"]]) {
    expect(overlaps(...pair as [string, string])).toBe(true);
    expect(() => validateWorkflow({ name: "overlap", tasks: [task("a", [pair[0]]), task("b", [pair[1]])] })).toThrow("overlap");
  }
});
test("transitive dependencies can share files without allowing independent overlaps", () => {
  expect(validateWorkflow({ name: "ordered", tasks: [task("a", ["src"]), task("b", ["test"], ["a"]), task("c", ["src/api.ts"], ["b"])] })).toEqual([["a"], ["b"], ["c"]]);
  expect(validateWorkflow({ name: "independent", tasks: [task("a", ["src/api.ts"]), task("b", ["src/api-extra.ts"])] })).toEqual([["a", "b"]]);
});
test("cycles, missing dependencies, traversal and duplicate IDs fail before execution", () => {
  for (const tasks of [[task("a", [], ["b"]), task("b", [], ["a"])], [task("a", [], ["missing"])], [task("a", ["../secrets"])], [task("a", ["C:/secrets"])], [task("a", []), task("a", [])]])
    expect(() => validateWorkflow({ name: "bad", tasks })).toThrow();
});
