// Each substitution changes executable TypeScript only. A parse/type/setup failure
// is an invalid test: only a failed proof obligation can kill a substitution.
const faults: [string, string, string, string][] = [
  [
    "input failure enters recovery",
    "runtime/outcome",
    'if (phase === "run")',
    'if (phase === "run" || phase === "input")',
  ],
  [
    "settlement retains a running task",
    "concurrency/accounting",
    "task: task - 1",
    "task: task",
  ],
  [
    "dispatch loses a queued job",
    "concurrency/accounting",
    "running: running + 1",
    "running: running",
  ],
  [
    "release leaves a phantom reservation",
    "core/owner-phase",
    "return active - 1;",
    "return active;",
  ],
  [
    "binding failure reuses an unsafe WASM session",
    "wasm/session-policy",
    "return inGuestCall && !isTrap;",
    "return !isTrap;",
  ],
  [
    "dead worker takes another job",
    "workers/host-phase",
    "return !dead && ready",
    "return ready",
  ],
  [
    "an active ancestor can be revisited",
    "core/job-tree",
    "return !onPath &&",
    "return",
  ],
  [
    "distinct children can share an identity",
    "pipe/routing",
    "(known && !sameChild)",
    "(known && sameChild)",
  ],
  [
    "Vite drops text between consecutive edits",
    "workers/source-edit",
    "parts.push(source.slice(start, offset));",
    'parts.push("");',
  ],
  [
    "untargeted plugin dropped",
    "core/plugin-target",
    "return target === undefined || target === id;",
    "return target === undefined ? false : target === id;",
  ],
  [
    "child receives untargeted plugins",
    "pipe/routing",
    "return target === undefined ? owner",
    "return target === undefined ? true",
  ],
  [
    "later matching registration dropped",
    "core/selection",
    "kept.push(item);",
    "if (kept.length === 0) kept.push(item);",
  ],
  [
    "temporary registrations first",
    "core/sequences",
    "return [...persistent, ...temporary]",
    "return [...temporary, ...persistent]",
  ],
  [
    "cursor skips the first eligible hook or job",
    "core/eligibility",
    "if (eligible(items[i]))",
    "if (i > start && eligible(items[i]))",
  ],
  [
    "removed registrations retained",
    "core/selection",
    "if (keep(item))",
    "if (!keep(item))",
  ],
  [
    "capture leaks output",
    "context/capture",
    'output: full || mode === "outputs"',
    "output: true",
  ],
  [
    "batch overcharges occupancy",
    "core/capacity",
    "return used + requested;",
    "return used + requested + 1;",
  ],
  [
    "spent restart budget grows",
    "core/capacity",
    "return used < limit ?",
    "return used <= limit ?",
  ],
  [
    "terminal owner reopens",
    "core/owner-phase",
    "return terminal || !reopen ?",
    "return !reopen ?",
  ],
  [
    "first leaf gets the wrong ordinal",
    "core/job-tree",
    "return length - 1;",
    "return length;",
  ],
  [
    "scalar overwrites multi-input tuple",
    "runtime/outcome",
    'arity === 1 ? "wrap"',
    'arity >= 1 ? "wrap"',
  ],
  [
    "single finalization failure swallowed",
    "runtime/outcome",
    "if (finalizerFailures > 0)",
    "if (finalizerFailures > 1)",
  ],
  [
    "execution failure becomes last cause",
    "runtime/failures",
    "[execution, ...cleanup]",
    "[...cleanup, execution]",
  ],
  [
    "diagnostic traversal exceeds depth",
    "error/limits",
    "depth < 8;",
    "depth <= 8;",
  ],
  [
    "catalog accepts a wrong domain",
    "error/catalog-identity",
    "actual.domain === expected.domain &&",
    "",
  ],
  [
    "busy host accepts overlapping work",
    "workers/host-phase",
    ': phase === "ready";',
    ': phase !== "failed";',
  ],
  [
    "stale reply settles a current job",
    "workers/host-phase",
    "active.id === reply.id;",
    "true;",
  ],
  [
    "digest loses a leading zero",
    "wasm/digest",
    "digits.slice(high, high + 1) + ",
    "",
  ],
  [
    "generated source loses suffix",
    "workers/source-edit",
    " + source.slice(offset);",
    ";",
  ],
];

const root = Deno.cwd();
const compiler = root + "/tools/formal/node_modules/.bin/lsc";
const work = await Deno.makeTempDir({
  dir: ".artifacts",
  prefix: "proof-faults-",
});
const results: string[] = [];
try {
  for (const [name, module, original, broken] of faults) {
    const source = await Deno.readTextFile("src/" + module + ".ts");
    const lines = source.split("\n");
    const sites = lines.map((line, i) => [line, i] as const).filter(([line]) =>
      !line.trimStart().startsWith("//") && line.includes(original)
    );
    if (sites.length !== 1 || sites[0][0].split(original).length !== 2) {
      throw new Error("Ambiguous or missing fault site: " + name);
    }
    const directory = await Deno.makeTempDir({ dir: work });
    await Deno.copyFile("lemmascript.json", directory + "/lemmascript.json");
    await Deno.writeTextFile(
      directory + "/candidate.ts",
      lines.with(sites[0][1], sites[0][0].replace(original, broken)).join("\n"),
    );
    const run = await new Deno.Command(compiler, {
      cwd: directory,
      args: ["check", "--backend=dafny", "candidate.ts"],
    }).output();
    const decoder = new TextDecoder();
    const output = decoder.decode(run.stdout) + decoder.decode(run.stderr);
    if (
      run.success ||
      !/Error:.*(?:postcondition|invariant).*(?:proved|established|hold|maintained)/i
        .test(output)
    ) {
      throw new Error(
        name + " did not produce the expected proof failure:\n" + output,
      );
    }
    console.log("Rejected: " + name);
    results.push(name);
  }
} finally {
  await Deno.remove(work, { recursive: true });
}
console.log(results.length + " executable faults rejected by Dafny.");
