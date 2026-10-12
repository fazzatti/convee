import { parse, sourceFiles, ts } from "@tools/source.ts";
import { mutationStatus } from "@tools/mutation-result.ts";

interface Mutant {
  id: string;
  file: string;
  start: number;
  end: number;
  replacement: string;
  critical: boolean;
}
const directory = ".artifacts/mutation";
const sources = new Map<string, string>();
for (const file of await sourceFiles()) {
  sources.set(file, await Deno.readTextFile(file));
}
const mutants: Mutant[] = [];
const catalog: [string, string, string, string][] = [
  [
    "concurrency-shared-limit",
    "src/concurrency/scheduler.ts",
    "this.running < this.config.concurrency",
    "this.running < Number.MAX_SAFE_INTEGER",
  ],
  [
    "concurrency-task-limit",
    "src/concurrency/scheduler.ts",
    "(this.active.get(task) ?? 0) < task.concurrency",
    "true",
  ],
  [
    "concurrency-shared-admission",
    "src/concurrency/scheduler.ts",
    "jobs.length > this.config.maxPending - this.pending",
    "jobs.length > this.config.maxPending",
  ],
  [
    "concurrency-result-order",
    "src/concurrency/jobs.ts",
    "shape.map((child)",
    "[...shape].reverse().map((child)",
  ],
  [
    "concurrency-job-ownership",
    "src/concurrency/jobs.ts",
    "!descriptor || descriptor.owner !== owner",
    "!descriptor",
  ],
  [
    "wasm-owned-output",
    "src/wasm/session.ts",
    "const copy = structuredClone(output);",
    "const copy = output;",
  ],
  [
    "wasm-reject-shared-output",
    "src/wasm/session.ts",
    "value instanceof SharedArrayBuffer",
    "false",
  ],
  [
    "wasm-retire-unsafe-session",
    "src/wasm/session.ts",
    "await this.release();",
    "",
  ],
  [
    "wasm-preserve-domain-session",
    "src/wasm/session.ts",
    "session.isApplicationError?.(error) === true",
    "false",
  ],
  [
    "wasm-replacement-budget",
    "src/wasm/session.ts",
    "this.restarts++;",
    "this.restarts += 2;",
  ],
  [
    "wasm-admission-capacity",
    "src/wasm/lifecycle.ts",
    "this.active >= this.maxPending",
    "false",
  ],
  [
    "wasm-dispose-while-draining",
    "src/wasm/lifecycle.ts",
    "this.terminal ||= terminal;",
    "this.terminal ||= false;",
  ],
  [
    "wasm-terminal-dispose",
    "src/wasm/resource.ts",
    "dispose: () => lifetime.close(true)",
    "dispose: () => lifetime.close()",
  ],
  [
    "worker-plugin-copy",
    "src/workers/definition.ts",
    "[...plugins, plugin]",
    "plugins",
  ],
  [
    "worker-nested-order",
    "src/workers/jobs.ts",
    "shape.map((child)",
    "[...shape].reverse().map((child)",
  ],
  [
    "worker-capacity-release",
    "src/workers/parallel.ts",
    "generation.release();",
    "",
  ],
  [
    "worker-terminal-dispose",
    "src/workers/parallel.ts",
    "dispose: () => lifetime.close(true)",
    "dispose: () => lifetime.close()",
  ],
  [
    "worker-batch-capacity",
    "src/workers/pool.ts",
    "this.pending + jobs.length > this.setup.maxPending",
    "jobs.length > this.setup.maxPending",
  ],
  [
    "finalizer-invocation",
    "src/runtime/execution.ts",
    "yield* invoke(plugin, plugin.finally, []);",
    "",
  ],
  [
    "finalizer-continuation",
    "src/runtime/execution.ts",
    "failures.push({",
    "throw failure; failures.push({",
  ],
  [
    "finalizer-preserves-execution-error",
    "src/runtime/error.ts",
    "errors.unshift(executionError)",
    "errors.unshift(new Error('lost execution error'))",
  ],
  ["invocation-isolation", "src/runtime/execution.ts", ".fork()", ""],
  [
    "output-capture",
    "src/runtime/execution.ts",
    "controller.updateCurrentStepOutput(output);",
    "",
  ],
  [
    "plugin-cleanup",
    "src/runtime/execution.ts",
    "controller.leavePlugin();",
    "",
  ],
  ["step-cleanup", "src/runtime/execution.ts", "controller.leaveStep();", ""],
  [
    "registration-order",
    "src/runtime/execution.ts",
    "[...persistent, ...temporary]",
    "[...temporary, ...persistent]",
  ],
  [
    "input-tuple-copy",
    "src/runtime/execution.ts",
    "input = [...result]",
    "input = result",
  ],
  [
    "error-input-copy",
    "src/runtime/execution.ts",
    "[error, [...input]]",
    "[error, input]",
  ],
  [
    "callable-chain",
    "src/runtime/callable.ts",
    "result === instance ? invoke : result",
    "result",
  ],
  [
    "callable-freeze",
    "src/runtime/callable.ts",
    "Object.freeze(invoke)",
    "invoke",
  ],
  [
    "steps-copy",
    "src/pipe/pipe.ts",
    "return [...this.children]",
    "return this.children",
  ],
  [
    "pipe-plugin-copy",
    "src/pipe/pipe.ts",
    "return [...this.registered]",
    "return this.registered",
  ],
  [
    "step-plugin-copy",
    "src/step/step.ts",
    "return [...this.registered]",
    "return this.registered",
  ],
  [
    "pipe-routing-order",
    "src/pipe/pipe.ts",
    "[...this.registered, ...(options.plugins ?? [])]",
    "[...(options.plugins ?? []), ...this.registered]",
  ],
  [
    "plugin-definition-copy",
    "src/plugin/plugin.ts",
    "...hooks,",
    "...definition,",
  ],
  [
    "shared-store-copy",
    "src/context/runtime.ts",
    "new Map(this.values)",
    "this.values",
  ],
  [
    "completion-history",
    "src/context/runtime.ts",
    "this.history.previous = { ...snapshot };",
    "",
  ],
];
for (const [id, file, anchor, replacement] of catalog) {
  const text = sources.get(file)!;
  const start = text.indexOf(anchor);
  if (start < 0) throw new Error("Mutation anchor changed: " + id);
  mutants.push({
    id,
    file,
    start,
    end: start + anchor.length,
    replacement,
    critical: true,
  });
}
for (const [file, text] of sources) {
  if (
    !/\/runtime\/|\/context\/runtime.ts|\/(step|pipe)\/(step|pipe).ts|\/plugin\/plugin.ts/
      .test(file)
  ) continue;
  const source = parse(file, text);
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) {
      const condition = node.expression;
      mutants.push({
        id: file + ":" +
          (source.getLineAndCharacterOfPosition(condition.getStart()).line + 1),
        file,
        start: condition.getStart(),
        end: condition.end,
        replacement: "!(" + condition.getText(source) + ")",
        critical: false,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

async function copyTree(source: string, destination: string): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    if (
      entry.name.startsWith(".") || entry.name === "coverage" ||
      entry.name === "node_modules"
    ) continue;
    const from = source + "/" + entry.name, to = destination + "/" + entry.name;
    if (entry.isDirectory) await copyTree(from, to);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".json")) {
      await Deno.copyFile(from, to);
    }
  }
}
await Deno.mkdir(directory, { recursive: true });
const tests = [
  "src",
  "test/workers/parallel.integration.test.ts",
  "test/wasm/resource.integration.test.ts",
  "test/regressions",
  "test/concurrency",
  "test/properties",
  "test/fixtures",
];
for await (const entry of Deno.readDir("test")) {
  if (entry.isFile && entry.name.endsWith(".integration.test.ts")) {
    tests.push("test/" + entry.name);
  }
}
async function run(
  cwd: string,
): Promise<{ passed: boolean; timedOut: boolean; output: string }> {
  const child = new Deno.Command("deno", {
    cwd,
    args: ["test", "--no-check", "--reporter=dot", ...tests],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch { /* The process may have exited at the deadline. */ }
  }, 20000);
  try {
    const result = await child.output();
    return {
      passed: result.success,
      timedOut,
      output: new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr),
    };
  } finally {
    clearTimeout(timer);
  }
}
const baseline = await run(".");
if (!baseline.passed) {
  throw new Error("Mutation baseline failed:\n" + baseline.output);
}
const results: {
  id: string;
  file: string;
  critical: boolean;
  status: string;
}[] = [];
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async (_, worker) => {
  const workspace = directory + "/worker-" + worker;
  try {
    await Deno.remove(workspace, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  await copyTree("src", workspace + "/src");
  await copyTree("test", workspace + "/test");
  for (const file of ["deno.json", "deno.lock"]) {
    await Deno.copyFile(file, workspace + "/" + file);
  }
  while (cursor < mutants.length) {
    const mutant = mutants[cursor++];
    const original = sources.get(mutant.file)!;
    await Deno.writeTextFile(
      workspace + "/" + mutant.file,
      original.slice(0, mutant.start) + mutant.replacement +
        original.slice(mutant.end),
    );
    try {
      const result = await run(workspace);
      const status = mutationStatus(result);
      results.push({
        id: mutant.id,
        file: mutant.file,
        critical: mutant.critical,
        status,
      });
      await Deno.writeTextFile(
        directory + "/" + mutant.id.replaceAll(/[^a-z0-9-]/gi, "_") + ".log",
        result.output,
      );
      console.log(status + " " + mutant.id);
    } finally {
      await Deno.writeTextFile(workspace + "/" + mutant.file, original);
    }
  }
}));
const killed = results.filter((entry) => entry.status === "killed").length;
const criticalSurvivors = results.filter((entry) =>
  entry.critical && entry.status !== "killed"
);
const score = 100 * killed / results.length;
await Deno.writeTextFile(
  directory + "/report.json",
  JSON.stringify(
    {
      methodology:
        "All if-condition negations in the invocation runtime plus named defensive-copy, ordering and cleanup mutants. Each mutation runs in a disposable source copy, never the checkout. All runtime suites run without type checking after a passing typed CI baseline. Only a failed-test summary counts as a kill; module/infrastructure errors are invalid and timeouts never count as kills.",
      score,
      killed,
      total: results.length,
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ score, killed, total: results.length, criticalSurvivors }),
);
if (
  criticalSurvivors.length || score < 90 ||
  results.some((result) =>
    result.status === "invalid" || result.status === "timeout"
  )
) Deno.exit(1);
