# Convee

Typed functions, pipelines and lifecycle plugins for Deno. No runtime
dependencies, network access, implicit scheduling or workflow service.

The common API is five building blocks: `step`, `pipe`, `plugin`,
`createRunContext` and `ConveeError`. A callable remains a real function,
including `bind`, `call` and `apply`.

## Install and run

```sh
deno add jsr:@fifo/convee
```

```ts
import { pipe, plugin, step } from "jsr:@fifo/convee";

const total = step((prices: number[]) =>
  prices.reduce((sum, price) => sum + price, 0)
);
const receipt = pipe([total, (amount: number) => amount.toFixed(2)]);
receipt.use(plugin().onOutput((text: string) => "$" + text));
console.log(await receipt([10, 2.5])); // $12.50
```

This branch prepares **2.0.0**, a breaking release. Until it is published, use
this checkout rather than expecting the registry to serve the new behavior. CI
covers Deno **2.6.0 and 2.9.6**. Browser/Node distribution is not a support
promise made by this release.

## Arguments and composition

Callbacks keep their exact parameter tuple. One array argument stays one
argument. Optional, rest, nullable, union and explicit `undefined` parameters
retain their TypeScript meaning. Callback arity is never guessed from
`function.length`.

Between pipe children, **an array result is spread into the next child's
arguments**. Return a one-element outer tuple to pass an array as one argument:

```ts
import { pipe } from "jsr:@fifo/convee";

const join = pipe([
  (text: string): [string, number] => [text, text.length],
  (text: string, length: number) => text + ":" + length,
]);
const sum = pipe([
  (value: number): [number[]] => [[value, value + 1]],
  (values: number[]) => values.reduce((total, value) => total + value, 0),
]);
console.log(await join("hello"), await sum(2));
```

An input hook returns the full outer argument tuple. For exactly one non-array
argument, returning the replacement scalar is also supported. For one
array-valued argument, return `[array]`, not `array`. Empty input and
multi-input hooks must return a tuple, not a scalar.

Pipes accept raw functions, steps, nested pipes and structural adapters
implementing `id`, `isSync` and `runWith`. Empty pipes are rejected. Distinct
children cannot share an ID or collide with their parent's ID. Repeating the
**same child object** is allowed and shares its per-ID state.

The `steps` getter returns a defensive array copy. Nested children expose a
shallow invocation type to avoid recursively expanding entire graph types. Keep
the original nested pipe variable when configuring or inspecting its internals.
Flat and nested graphs of 10, 25, 50 and 100 children/levels are checked in CI;
larger graphs have no unlimited-depth guarantee.

## Plugins and lifecycle

```ts
import { plugin, step } from "jsr:@fifo/convee";

const normalize = plugin.sync({ id: "normalize" })
  .onError((_failure: Error, _input: [string]) => "fallback")
  .onInput((text: string) => text.trim())
  .onOutput((text: string) => text.toUpperCase());

const label = step.sync((text: string) => text, { plugins: [normalize] });
console.log(label(" hello "));
```

All six fluent hook-registration orders are supported.
`plugin.for<InputTuple,
Output, Error>()(definition)` provides an explicit
contract when inference is not enough. Hook identity comes from factory options.
Undefined optional hooks are omitted; defined non-functions and empty
definitions are rejected. Hook descriptors are immutable and copy only supported
fields.

Execution order is input hooks, body, then output hooks. Within each phase,
persistent registrations run before `runWith` plugins, in registration order.

- Only **body failures** reach error hooks. The first non-`Error` return
  recovers.
- Returning an `Error` passes failure to the next error hook. An `Error` object
  cannot represent successful recovery; wrap it in an object instead.
- Input-hook, output-hook and error-hook failures propagate. Completed output
  hooks are never replayed.
- A normal body may return an `Error` as data. Recovery has the separate rule
  above.
- `use` and `remove` mutate the same runtime and return the original callable.
  Duplicate plugin IDs execute all registrations; `remove(id)` removes all
  matches.
- Registration and routing plans are captured at invocation start. Changes while
  awaiting apply to later runs. A child's own registrations are captured when
  that child starts, not when its parent starts.
- A pipe plugin with no target wraps the whole pipe. A target selects the pipe
  itself or a direct child, never an arbitrary descendant. Known literal IDs are
  checked statically; runtime-generated strings are validated at runtime.

`step.sync` and `pipe.sync` reject thenables from bodies, hooks and structural
adapters. They never silently turn a Promise into downstream data. Accidentally
starting asynchronous work is not cancellable by Convee, so do not put async
callbacks into a sync runtime through unsafe casts.

## Shared context and concurrent work

```ts
import { createRunContext, step } from "jsr:@fifo/convee";

const read = step.withContext<{ requestId: string }>()(
  function (value: number) {
    console.log(this.context().state.get("requestId"));
    return value + 1;
  },
);
const context = createRunContext({
  seed: { requestId: "request-1" },
  capture: "outputs",
});
console.log(await read.runWith({ context: { parent: context } }, 2));
```

Each invocation owns its live step/plugin frames, including simultaneous calls
sharing a parent. `this.context()` is scoped to that invocation. Root state and
per-ID stores are deliberately shared. Convee does **not** make
application-level read/await/write sequences atomic; serialize conflicting
updates yourself.

Completed snapshots follow the same policy through `get`, `all` and `previous`:

| Capture             | Completed input | Completed output | Completed error |
| ------------------- | --------------- | ---------------- | --------------- |
| `none`              | no              | no               | no              |
| `outputs` (default) | no              | yes              | no              |
| `all`               | yes             | yes              | yes             |

Live invocation data is available while its body or hooks execute in every mode.
`current()` throws outside its scope. `previous()` means **the last invocation
that completed in the shared run**, including nested children and concurrent
siblings. It is not necessarily the preceding child in your pipeline.

Only the latest snapshot/state per unique ID and one completion-history entry
are retained. Repeating one ID does not retain every invocation. Introducing
unbounded new IDs or keeping large values in shared stores can still consume
unbounded memory. Use a fresh context for an independent request.

Snapshot arrays, registration arrays, child arrays and store `entries()` protect
their structure. Payload objects are not cloned, deep-frozen, sanitized or
redacted.

## Errors and diagnostics

Native errors propagate by identity. Thrown strings become native errors. Other
thrown values become catalog errors such as `STP_000` and `PIP_000`, preserving
the original cause and the first failure's trace.

`ConveeError.toJSON()` provides bounded diagnostic output for cycles, bigint,
symbols, functions and hostile objects. It limits depth to 8, visited objects to
1000, and array/object width to 100. It is intentionally lossy and **not a
secure redaction policy** or a format for reconstructing trusted errors.

Domain guards check known catalog codes and required metadata fields. General
branding/catalog-matching helpers are in-process typing conveniences, not an
authentication boundary for JSON from untrusted parties. An earlier failure can
remain in an all-capture snapshot after successful recovery.

## Migrating from 1.x

- Single array inputs now preserve their outer argument tuple. Update input
  hooks to return `[array]` and review array-producing pipe links.
- Sync APIs reject thenables rather than allowing Promise-derived corruption.
  Native promise rejections are observed to avoid a second unhandled rejection;
  custom thenables are not executed. Already-started async work cannot be
  cancelled.
- Recovery is body-only, without output-hook replay.
- Per-invocation context views replace shared live stacks. Retain shared
  `state`, not an assumption that every invocation has the same context object.
- Completed capture policies and `previous()` now agree and discard old payload
  history. Do not depend on previous-entered behavior.
- `use/remove` return the callable. Registration getters are copies, not
  writable engine state. Plugin list types no longer pretend mutation creates an
  immutable history that stays correct through aliases.
- Duplicate distinct child IDs, reserved plugin-definition fields and fabricated
  branded error objects no longer behave as permissive inputs.

The core runtime vocabulary remains the same. Additional type-only exports make
supporting public signatures navigable in JSR documentation; most consumers only
need the five main building blocks.

## Contributing and verification

```sh
deno task verify
deno task test:stress
deno task test:mutation
deno task test:resources
deno task bench
```

`verify` checks formatting, lint, unused declarations, public consumer types,
all unit/integration/regression/property fixtures, JSDoc, README examples, AST
module boundaries, deep type graphs, isolated package consumption, coverage and
a normal JSR dry run **without** `--allow-slow-types`.

Runtime tests run without blanket `-A` permissions. Source-analysis tools have
scoped read/write/process permissions and an explicit list of TypeScript's
startup environment reads. Mutation tests work in disposable copies below
`.artifacts`, never by modifying the checkout.

CI runs 60000 seeded property cases, controlled concurrency scenarios, actual
garbage-collection retention tests and the mutation campaign on every PR.
Coverage gates require at least 98% source lines and 95% branches. Mutation
gates require all named critical mutants and at least 90% of the generated
campaign to be killed; timeouts are not counted as kills. The
[testing guide](TESTING.md) explains the measurement limits.

Benchmark JSON, mutation logs, HTML/LCOV coverage, type-depth timing and
complexity/CRAP-proxy reports are attached to CI. Benchmarks are trend evidence,
not a machine-dependent latency gate. Complexity metrics guide review and do not
prove financial, concurrency or business correctness.
