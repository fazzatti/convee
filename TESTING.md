# Testing and quality contracts

Convee keeps the runtime dependency-free and spends its complexity budget on
development-time checks. A green coverage badge is not evidence that the
assertions would detect changed behavior. Run the complementary checks below.

## Supported environments

PR checks pin Deno 2.6.0 and 2.9.6. Both must pass consumer type contracts,
runtime tests, isolated package consumption, garbage-collection retention and
graphs up to 100 nodes. Deno 2.9.6 runs the quality, mutation, stress and
benchmark jobs. Node and browsers are not part of the supported-runtime matrix
yet.

Install one of these Deno versions and run commands from the repository root.
The first run resolves pinned development dependencies from the lockfile. No
wallets, credentials, servers, real funds or network services are needed by the
test cases. JSR publish validation can contact the registry but does not
publish.

## Local workflow

| Command                      | What it proves                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `deno task verify`           | Formatting, lint, unused declarations, types, docs, runtime suites, architecture, type depth, coverage, isolated consumer and JSR dry run |
| `deno task test:unit`        | Existing module-level behavior                                                                                                            |
| `deno task test:integration` | Existing composed public API scenarios                                                                                                    |
| `deno task test:types`       | Positive consumers compile and deliberately invalid consumers remain errors                                                               |
| `deno task test:stress`      | 10000 generated cases for each of six properties                                                                                          |
| `deno task test:mutation`    | Assertions reject deliberately altered runtime semantics                                                                                  |
| `deno task test:resources`   | Completed invocation inputs become collectible according to capture policy                                                                |
| `deno task bench`            | Repeatable benchmark definitions with machine-dependent results                                                                           |

Run `deno task fmt` after intentional edits. `verify` checks formatting without
rewriting files. Type-only fixture functions are not executed: their invalid
examples use `@ts-expect-error`, which becomes a compiler failure if an invalid
call starts being accepted. Deliberately unsafe runtime inputs are separately
constructed in the regression fixtures.

## Behavioral coverage

- `src/**/*.unit.test.ts` and `test/*.integration.test.ts` retain the original
  module and public composition scenarios.
- `test/regressions` covers every sync/async step/pipe mode, exact argument
  tuples, native callable methods, registration order, phase failures, recovery,
  thenables, normalized descriptors, hostile diagnostics and snapshot ownership.
- `test/concurrency` uses explicit promise gates, not elapsed-time guesses, to
  vary hook phase, capture mode and completion order with a shared parent.
- `test/fixtures` contains a realistic parse/validate/enrich workflow and the
  public API/package consumer fixtures.
- `test/properties` compares generated operations against small independent
  models for graph execution, registration commands, tuple transport, diagnostic
  projection, concurrent isolated runs and recovery.

Runtime tests request no blanket `-A` permissions. Source-analysis tools read
source/configuration and explicitly allow TypeScript's startup environment
variables. Generators and mutation tools write only `.artifacts` and launch
`deno` subprocesses. Those subprocesses execute trusted local test code; do not
run a modified contributor branch without reviewing it.

## Property replay and larger campaigns

The PR seed is `20260905`. A normal runtime test run executes 1000 cases for
each property, and `test:stress` executes 10000 each, or 60000 generated cases.
These are generated cases, not 60000 separately maintained tests.

Fast-check reports the seed, shrink path and minimized counterexample on
failure. Run the individual test with
`deno test test/properties --filter="property name"`. For exact replay,
temporarily set the reported `seed` and `path` in the settings of
`test/properties/models.test.ts`, keeping the failing test's generators intact.
Restore those temporary settings after reducing the case into a permanent
regression. For an intentional new campaign, change the seed or case budget
explicitly and record them with the result. There is no scheduled background
job.

Generators are bounded by graph length, command count and value ranges. They do
not exhaust JavaScript programs or all asynchronous schedules. Deterministic
shared-parent interleavings remain necessary alongside generated tests.

## Mutation testing

`tools/mutation.ts` negates all `if` conditions in the invocation/context,
step/pipe engines and plugin descriptor runtime. It also applies named mutations
to copies, ordering, cleanup, callable identity and completion history. It does
not claim to mutate every expression, every error message or TypeScript types.

The tool requires a passing runtime baseline and copies sources into four
disposable workers. Each mutant gets a 20-second deadline. Original checkout
files are never overwritten. CI runs a typed baseline first; mutant executions
use `--no-check` so a TypeScript error alone cannot count as a runtime kill.

All named critical mutants must be killed, as must at least 90% of the generated
campaign. Only an actual failed-test summary counts as a kill. Module-loading
and infrastructure failures are invalid, not successful assertion evidence.
Timeouts and invalid runs fail CI and never count as kills. Investigate
survivors rather than weakening the gate. A genuinely equivalent mutation should
be explained and removed from the operator or the redundant production code, not
disguised as an assertion success. Inspect the per-mutant logs to distinguish
behavioral test failures from infrastructure or module-loading errors.

The baseline campaign contains 49 mutants. This count changes with runtime code;
the report, not this number, is authoritative. A 100% score applies only to this
bounded operator set. Add targeted mutants when a new invariant is introduced.

Reports: `.artifacts/mutation/report.json` and individual logs. They are
uploaded even when the mutation job fails.

## Coverage, complexity and architecture

Production coverage must reach 98% lines and 95% branches. The checker rejects
executable function modules missing from the LCOV report. Pure type declarations
are checked by consumer/compiler fixtures, not assigned fictitious runtime
coverage. Tests and development tooling do not inflate the production
percentage.

`.artifacts/quality.json` reports missing lines, a syntactic cyclomatic
approximation and `complexity² × (1 - lineCoverage)³ + complexity`. This is a
**line-based CRAP proxy**, not basis-path coverage or a correctness proof.
Functions exceeding syntactic complexity 20 fail the explicit review budget. Do
not split coherent code solely to improve this number.

Architecture tests resolve imports, type imports and re-exports using the
TypeScript AST. They enforce internal-only production dependencies, layer
directions, runtime acyclicity, the reviewed public export fixture and packaging
rules. Computed dynamic imports require an explicit design change. Type-only
cycles are distinct from runtime cycles.

The isolated consumer copies production sources into a separate package and
rewrites internal aliases to relative imports, then checks and executes against
its own configuration. This catches repository-alias dependence; it is not a
claim that a new version has already been installed from JSR. The separate real
`deno publish --dry-run` validates publishability without `--allow-slow-types`.

## Retention, type depth and performance

Retention tests use weak references and explicitly exposed V8 garbage
collection, not a private method stub or one noisy heap-byte reading. Each
capture mode runs 5000 distinct payloads through a reused parent and one fixed
step ID. Older inputs must be collected; only `all` may retain the last input.
Per-ID state is intentionally persistent: creating unlimited unique IDs or
storing every payload yourself can still grow memory.

Type-depth fixtures generate flat and nested graphs of 10, 25, 50 and 100 nodes
in sync and async modes and assert their actual output types. Nested metadata
uses a shallow step view to avoid recursively instantiating the entire graph.
Keep the original pipe variable if you need its full configuration API.

Benchmarks compare a raw callback, sync capture modes with 0/1/5/20 hooks, an
async step, ten steps and nested pipes. Compare repeated warmed runs on the same
runtime and machine. CI uploads JSON trends; it deliberately does not fail on
arbitrary latency thresholds from shared runners.

## Releases

The 2.0.0 candidate intentionally changes ambiguous 1.x tuple, recovery, capture
and mutable-configuration behavior. Read the README migration section before
upgrading. Publishing runs only after the full reusable quality workflow passes,
is serialized, and does not use the slow-types escape hatch. Merging an untagged
version into `main` triggers the existing automatic publication workflow.
Opening or pushing a PR does not publish it.
