import { Memory, projectKey } from "../src/memory.ts";

const [operation = "help", ...args] = process.argv.slice(process.argv[2] === "memory" ? 3 : 2);
if (operation === "help") {
  console.log("Uranium memory: capture [--user] <summary> | recall [--user] <query> | review [--user] | approve [--user] <candidate-id> <review-revision> | reject [--user] <candidate-id> <review-revision> | native <OMH memory subcommand and flags>");
} else {
  if (!["capture", "recall", "review", "approve", "reject", "native"].includes(operation)) throw new Error("Unknown memory command");
  const user = args.includes("--user"), values = args.filter(x => x !== "--user");
  const memory = new Memory(projectKey(process.cwd()));
  const result = await memory.call(operation, { scope: user ? "user" : "project", summary: values.join(" "), query: values.join(" "), id: values[0], revision: values[1], arguments: values });
  console.log(operation === "native" && typeof result.result?.message === "string" ? result.result.message : JSON.stringify(result, null, 2));
  if (operation === "native" && result.exitCode) process.exitCode = result.exitCode;
}
