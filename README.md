<div align="center">
  <h1>convee</h1>
</div>

<p align="center">
  A composable TypeScript library for building typed pipelines with plugins, shared run context, and structured errors.
</p>

<p align="center">
  <a href="https://jsr.io/@fifo/convee">JSR Package</a>
</p>

<div align="center">
  <a href="https://github.com/fazzatti/convee/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/fazzatti/convee/actions/workflows/ci.yml/badge.svg?branch=main" />
  </a>
  <a href="https://codecov.io/gh/fazzatti/convee">
    <img alt="codecov" src="https://codecov.io/gh/fazzatti/convee/graph/badge.svg?token=PBCJC39LSA" />
  </a>
  <a href="https://github.com/fazzatti/convee/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/fazzatti/convee" />
  </a>
  <a href="https://github.com/fazzatti/convee">
    <img alt="Open Source" src="https://img.shields.io/badge/open%20source-yes-brightgreen" />
  </a>
</div>

<br />

The runtime model is intentionally simple:

- `plugin` defines lifecycle hooks for `input`, `output`, and `error`
- `step` wraps one callable and owns step-level plugins
- `pipe` composes steps or nested pipes into a typed execution chain
- `createRunContext` carries shared state and execution snapshots
- `ConveeError` and the built-in error catalogs normalize failures

Convee has no runtime dependencies. You compose ordinary functions and attach
behavior explicitly where you need it.

## Installation

```bash
deno add jsr:@fifo/convee
```

```ts
import {
  ConveeError,
  createRunContext,
  pipe,
  plugin,
  step,
} from "jsr:@fifo/convee";
```

The examples below include their own imports and setup, so you can try them
individually. For an upgrade from 1.x, also read the
[migration guide](#migrating-from-1x).

## Architecture

### Plugins

Plugins are lifecycle wrappers. They do not execute by themselves. A plugin
becomes useful when you attach it to a step or a pipe.

Plugin capabilities:

- `input` transforms the incoming arguments before the wrapped unit runs
- `output` transforms the produced result after the wrapped unit finishes
- `error` recovers from a body failure or replaces it with another error
- `id` gives the plugin a stable identity for inspection and removal
- `target` scopes the plugin to a specific direct step when used in a pipe
- `supports(...)` checks whether a plugin implements a given lifecycle hook
- `targets(...)` checks whether a plugin applies to a given step id

Use `plugin.for<InputTuple, Output>()` to specify the arguments and result your
hooks work with. Here, the input is one number and the output is one number:

```ts
import { plugin } from "jsr:@fifo/convee";

const plusOne = plugin.for<[value: number], number>()(
  {
    output: (value) => value + 1,
  },
  { id: "plus-one" },
);
```

You can also build plugins fluently:

```ts
import { plugin } from "jsr:@fifo/convee";

const audit = plugin({ id: "audit" })
  .onInput((value: number) => value)
  .onOutput((value: number) => value);
```

Hook-registration order does not determine execution order. Whether you call
`onError`, `onInput` or `onOutput` first, execution still follows input hooks,
the body, then output hooks. All six registration orders are supported.

At least one hook is required. Hook functions and identity are fixed when the
descriptor is created. Pass `id` and `target` through the factory options, not
inside the hook definition. To change behavior, attach a new plugin or remove an
existing registration.

### Steps

A step wraps one function but still behaves like a callable function. The
returned value is both:

- a callable runtime you can invoke directly
- a step object with execution and plugin-management capabilities

Step capabilities:

- direct invocation: `await stepInstance(args...)`
- `run(...)` for explicit invocation with the same behavior as direct calls
- `runWith(...)` for one-off plugins or explicit context overrides
- `use(...)` to attach persistent plugins
- `remove(...)` to detach persistent plugins by `id`
- `id` for stable targeting and trace inspection
- `plugins` to inspect the persistent plugins attached to the step
- `isSync` to distinguish async and sync step runtimes

```ts
import { step } from "jsr:@fifo/convee";

const sum = step((left: number, right: number) => left + right, {
  id: "sum-step",
});

await sum(2, 3); // 5
await sum.run(2, 3); // 5
```

That direct-call shape is intentional: steps compose like normal functions, but
they keep the runtime controls needed for plugins and context-aware execution.

Native function methods such as `call`, `apply` and `bind` also work.

#### Persistent plugins

Attach a plugin with `use(...)` when it should apply to future calls. In this
example, the output hook doubles the sum:

```ts
import { plugin, step } from "jsr:@fifo/convee";

const sum = step((left: number, right: number) => left + right, {
  id: "sum-step",
});

sum.use(
  plugin.for<[left: number, right: number], number>()(
    {
      output: (value) => value * 2,
    },
    { id: "double-output" },
  ),
);

await sum(2, 3); // 10
```

Use `sum.remove("double-output")` to detach it. Both `use` and `remove` return
the same callable, so they can be chained. Removing an ID removes every plugin
registration with that ID. The `plugins` getter returns a copy of the list;
changing that array does not configure the step.

#### One-off plugins

Use `runWith(...)` when a plugin should apply only to one invocation:

```ts
import { plugin, step } from "jsr:@fifo/convee";

const sum = step((left: number, right: number) => left + right, {
  id: "sum-step",
});

const result = await sum.runWith(
  {
    plugins: [
      plugin.for<[left: number, right: number], number>()(
        {
          output: (value) => value + 10,
        },
        { id: "single-use" },
      ),
    ],
  },
  2,
  3,
);

console.log(result);
console.log(await sum(2, 3));
```

The one-off call returns `15`. The following ordinary call returns `5` because
the temporary plugin was not added to `sum.plugins`. If persistent and one-off
plugins are both present, persistent hooks run first within each lifecycle
phase.

### Pipes

A pipe also stays callable after composition. The returned value is both:

- a callable runtime for the whole chain
- a pipe object with step inspection, plugin management, and advanced run
  controls

Pipe capabilities:

- direct invocation: `await pipeInstance(args...)`
- `run(...)` for explicit invocation with the same behavior as direct calls
- `runWith(...)` for one-off plugins or explicit context overrides
- `use(...)` to attach persistent pipe-level or direct-step plugins
- `remove(...)` to detach persistent plugins by `id`
- `steps` to inspect the normalized inner step list
- `plugins` to inspect the persistent plugins attached to the pipe
- `id` for stable targeting and trace inspection
- `isSync` to distinguish async and sync pipe runtimes

A pipe composes steps, nested pipes, or raw functions. Raw functions are wrapped
as steps automatically, so the pipeline always runs over step-like units
internally.

```ts
import { pipe, step } from "jsr:@fifo/convee";

const add = step((value: number) => value + 1, { id: "add" });
const double = (value: number) => value * 2;

const numberPipe = pipe([add, double], {
  id: "number-pipe",
});

await numberPipe(2); // 6
```

That means you keep function-style composition at the edges while still getting
step ids, plugin targets, and typed execution controls inside the pipe.

#### Targeting an inner step

Pipes accept pipe-level plugins and plugins targeted at direct inner steps:

```ts
import { pipe, plugin, step } from "jsr:@fifo/convee";

const add = step((value: number) => value + 1, { id: "add" } as const);
const double = step((value: number) => value * 2, { id: "double" } as const);

const numberPipe = pipe(
  [add, double],
  {
    id: "number-pipe",
  } as const,
);

numberPipe.use(
  plugin.for<[value: number], number>()(
    {
      output: (value) => value + 3,
    },
    {
      id: "boost-add",
      target: "add",
    } as const,
  ),
);

await numberPipe(2); // 12
```

The `add` step produces `3`, its targeted plugin changes that to `6`, and
`double` produces `12`. Without a target, the plugin wraps the whole pipe
instead.

Targeted inner-step plugins are scoped to the pipe that owns them. Reusing the
same step in another pipe does not leak plugins across pipelines.

Targets select the pipe itself or one of its direct children, not arbitrary
descendants of a nested pipe.

#### Nested pipes and identities

Reuse an existing pipe as one stage of another:

```ts
import { pipe } from "jsr:@fifo/convee";

const calculate = pipe([
  (value: number) => value + 1,
  (value: number) => value * 2,
], { id: "calculate" });

const describe = pipe([
  calculate,
  (value: number) => `Total: ${value}`,
]);

console.log(await describe(2));
```

This returns `"Total: 6"`. Keep the original `calculate` variable when you want
to configure or inspect that nested pipe. Nested children in `describe.steps`
expose a shallow invocation type to avoid expanding the entire nested graph in
TypeScript.

Pipes need at least one child. Distinct children cannot share an ID or use the
parent pipe's ID, because IDs determine plugin routing and per-ID state. Reusing
the same child object more than once is allowed and shares that child's per-ID
state. The `steps` getter returns a defensive copy of the list.

### Run Context

Every run can carry shared state plus captured snapshots for steps and plugins.

Context capabilities:

- `state` stores shared mutable values for the current run tree
- `step.current()` reads the step executing in the current invocation
- `step.get(id)` reads the captured snapshot for a specific step
- `step.previous()` reads the last completed invocation in the shared run
- `step.all()` reads every captured step snapshot for the run
- `plugin.current()` reads the plugin executing in the current invocation
- `plugin.get(id)` reads the captured snapshot for a specific plugin
- `plugin.all()` reads every captured plugin snapshot for the run
- `runId` identifies the current run
- `rootRunId` identifies the root run when execution is nested
- `capture` controls retention of completed input, output and error data

```ts
import { createRunContext, step, type StepThis } from "jsr:@fifo/convee";

type Shared = {
  requestId: string;
  trace: string[];
};

const contextualStep = step.withContext<Shared>()(function (
  this: StepThis<Shared>,
  value: number,
) {
  const trace = [...(this.context().state.get("trace") ?? [])];
  trace.push(`step:${value}`);
  this.context().state.set("trace", trace);
  return `${this.context().state.get("requestId")}:${value}`;
});

const context = createRunContext<Shared>({
  capture: "all",
  seed: {
    requestId: "req-42",
    trace: [],
  },
});

const result = await contextualStep.runWith(
  {
    context: { parent: context },
  },
  7,
);

result; // "req-42:7"
context.state.get("trace"); // ["step:7"]
context.step.get(contextualStep.id)?.output; // "req-42:7"
```

Use `withContext<Shared>()` on `plugin`, `step`, or `pipe` when you want
`this.context()` to expose a typed shared state shape.

Use a regular function when accessing this injected `this`; an arrow function
captures its surrounding `this` instead.

#### Capture and history

Choose the amount of completed step data you want to retain:

| Capture             | Completed input | Completed output | Completed error |
| ------------------- | --------------- | ---------------- | --------------- |
| `none`              | no              | no               | no              |
| `outputs` (default) | no              | yes              | no              |
| `all`               | yes             | yes              | yes             |

The policy applies consistently to `get`, `all` and `previous`. Live data is
available through `current()` while the corresponding body or hook executes,
even with `capture: "none"`. Calling `current()` outside that scope throws.

`previous()` means the last invocation that **completed**, which may be a nested
child or a concurrent sibling. It does not necessarily mean the previous child
in the pipe. With `capture: "all"`, a recovered failure can remain in the
completed snapshot as diagnostic history.

Only the latest snapshot/state per unique ID and one completion-history entry
are retained. Create a fresh context for independent requests. Reusing one
context with unlimited new IDs, or storing every payload yourself, can still
grow memory.

#### Sharing context between overlapping calls

Calls using the same parent share `state` and per-ID stores, but each invocation
has its own live step and plugin frames. This keeps
`this.context().step.current()` associated with the correct call while
asynchronous work overlaps.

Shared state is still mutable application data. For example, two calls that both
read a counter, await something and then write it back can overwrite each
other's updates. Serialize those updates when necessary. Snapshot containers are
copied, but payload objects keep their identity and are not deep-cloned or
automatically redacted.

## Sync APIs

Every runtime primitive has an explicit sync variant:

- `plugin.sync(...)`
- `step.sync(...)`
- `pipe.sync(...)`

Use them when the entire execution graph must stay synchronous.

```ts
import { pipe, step } from "jsr:@fifo/convee";

const syncPipe = pipe.sync([
  step.sync((value: number) => value + 1),
  step.sync((value: number) => value * 2),
]);

syncPipe(2); // 6
```

Sync plugins use the same lifecycle hooks, without asynchronous callbacks:

```ts
import { plugin, step } from "jsr:@fifo/convee";

const uppercase = plugin.sync({ id: "uppercase" })
  .onInput((value: string) => value.trim())
  .onOutput((value: string) => value.toUpperCase());

const label = step.sync((value: string) => value, {
  plugins: [uppercase],
});

console.log(label(" hello "));
```

This returns `"HELLO"` directly, not a promise. Bodies, hooks and structural
adapters in a sync runtime must not return promises or other thenables. Unsafe
JavaScript or casts that bypass TypeScript checks are still rejected at runtime.
Rejecting the returned promise does not cancel asynchronous work that already
started, so use the asynchronous APIs when a callback needs to await something.

## Error Model

Convee provides structured errors for library failures while preserving native
errors thrown by your code:

- `ConveeError` is the common type for Convee's structured errors
- `PLG_ERRORS` contains plugin-domain creators
- `STP_ERRORS` contains step-domain creators
- `PIP_ERRORS` contains pipe-domain creators
- native `Error` objects propagate by identity
- thrown strings become native errors; other thrown values become catalog errors

### Recovering a body failure

An error hook can produce a fallback result when the wrapped body fails:

```ts
import { plugin, step } from "jsr:@fifo/convee";

const safeDivide = step((value: number) => {
  if (value === 0) throw new Error("division by zero");
  return 100 / value;
});

safeDivide.use(
  plugin.for<[value: number], number>()(
    {
      error: (error) => {
        console.error(error.message);
        return 0;
      },
    },
    { id: "recover-zero" },
  ),
);

await safeDivide(0); // 0
```

The first error hook to return a non-`Error` value recovers the failure. Output
hooks then process that recovered result. Returning an `Error` passes the
failure to the next error hook instead. To recover with an error as data, wrap
it in another value, such as `{ error }`.

Input-hook, output-hook and error-hook failures propagate out of that unit; they
do not enter its body-recovery loop. Completed output hooks are not replayed.
For nested pipes, a child's propagated failure can still reach the enclosing
pipe's error hooks because executing its children is the pipe's body.

### Narrowing and inspecting errors

Consumers can narrow structured failures to their domain and metadata:

```ts
import { isConveeErrorOf, step, STP_ERRORS } from "jsr:@fifo/convee";

const failingStep = step(() => {
  throw { reason: "boom" };
}, {
  id: "failing-step",
});

try {
  await failingStep();
} catch (error) {
  if (isConveeErrorOf(error, STP_ERRORS.UNKNOWN_THROWN)) {
    console.error(error.meta.stepId);
  }
}
```

Domain guards validate known catalog codes and required metadata. General
branding helpers are useful for in-process typing, not for authenticating
untrusted JSON.

`ConveeError.toJSON()` produces bounded diagnostic output, including for cycles
and bigint values. It limits depth to 8, visited objects to 1000 and collection
width to 100. This is a lossy logging representation, not a format for restoring
trusted error objects or a policy for removing sensitive data. Decide what to
log before sending application payloads to an external service.

## Design Notes

### Pipes compose plain values

Convee does not need a container, decorator system, or framework lifecycle. A
pipe is a typed chain from one output shape to the next input shape, and the
final runtime is still callable like a normal function.

```ts
import { pipe } from "jsr:@fifo/convee";

const pricePipe = pipe([
  (value: number) => value * 100,
  (value: number) => `${value} cents`,
]);

await pricePipe(12.5); // "1250 cents"
await pricePipe.run(12.5); // "1250 cents"
```

#### Arrays and argument tuples

A step keeps the callback's exact argument tuple. A callback taking one array
still receives one array. Optional, rest and explicit `undefined` arguments keep
their TypeScript meaning.

Between pipe children, an **array result is spread into the next child's
arguments**. Use a typed tuple when returning multiple arguments:

```ts
import { pipe } from "jsr:@fifo/convee";

const describe = pipe([
  (text: string): [string, number] => [text, text.length],
  (text: string, length: number) => `${text}: ${length}`,
]);

console.log(await describe("hello"));
```

This returns `"hello: 5"`. To pass an array as a **single** downstream argument,
put it inside a one-element outer tuple:

```ts
import { pipe } from "jsr:@fifo/convee";

const total = pipe([
  (value: number): [number[]] => [[value, value + 1]],
  (values: number[]) => values.reduce((sum, value) => sum + value, 0),
]);

console.log(await total(2));
```

The second child receives `[2, 3]` as one argument and returns `5`.

Input hooks also return the full outer argument tuple. For a single array
argument, return `[array]`, not `array`:

```ts
import { plugin, step } from "jsr:@fifo/convee";

const positiveValues = plugin.for<[values: number[]], number>()({
  input: (values) => [values.filter((value) => value > 0)],
});

const sum = step(
  (values: number[]) => values.reduce((total, value) => total + value, 0),
  { plugins: [positiveValues] },
);

console.log(await sum([-1, 2, 3]));
```

This returns `5`. For one non-array argument, returning a replacement scalar is
also supported, as in the fluent plugin examples. Zero-argument and
multi-argument hooks return a tuple.

### Plugins stay explicit

Plugins do nothing until you attach them. That makes behavior visible at the
call site and avoids hidden global middleware.

```ts
import { plugin, step } from "jsr:@fifo/convee";

const format = step((value: string) => value.trim());

await format("  hello  "); // "hello"

format.use(
  plugin.for<[value: string], string>()(
    {
      output: (value) => value.toUpperCase(),
    },
    { id: "uppercase" },
  ),
);

await format("  hello  "); // "HELLO"
```

Each invocation captures its registrations when it starts. Adding or removing
plugins while that invocation awaits affects subsequent calls, not its remaining
hooks. A pipe captures its own routing at the pipe's start; a child's own
plugins are captured when that child starts.

### Context flows through parent runs

Nested steps and nested pipes share state by receiving a parent run context.
That gives you one place to keep trace data, request-scoped values, or step
snapshots without relying on globals.

```ts
import { createRunContext, step } from "jsr:@fifo/convee";

const traceStep = step.withContext<{ trace: string[] }>()(
  function (value: number) {
    this.context().state.set("trace", [
      ...(this.context().state.get("trace") ?? []),
      `value:${value}`,
    ]);

    return value * 2;
  },
);

const requestContext = createRunContext({
  seed: {
    trace: [] as string[],
  },
});

await traceStep.runWith(
  {
    context: { parent: requestContext },
  },
  2,
);

requestContext.state.get("trace"); // ["value:2"]
```

### Public API stays intentional

The package root focuses on the runtime primitives and the types that directly
support them. Most consumers build with these same entrypoints:

```ts
import { createRunContext, pipe, plugin, step } from "jsr:@fifo/convee";
```

Additional type-only exports describe the public factory signatures and make
them navigable in generated documentation. They do not add runtime services or
require a different composition model.

## Migrating from 1.x

The building blocks remain the same, but review these behavioral changes when
upgrading:

- **Array-valued input hooks:** preserve the outer argument tuple with
  `[array]`. See [arrays and argument tuples](#arrays-and-argument-tuples).
- **Synchronous execution:** promises and other thenables are rejected rather
  than becoming downstream data. Use async primitives for asynchronous work.
- **Recovery:** only body failures enter that unit's error hooks. Input/output
  hook failures propagate, and completed output hooks are not replayed.
- **Live context:** each invocation has its own view. Share `state` through a
  parent instead of relying on identical context objects across calls.
- **History and capture:** `previous()` is the last completed invocation.
  Completed snapshots consistently follow the capture policy and do not retain
  every historical input.
- **Configuration:** `use` and `remove` return the same callable. Getters return
  copies of registration/child lists; mutate configuration through its methods.
- **Identity and validation:** distinct child IDs cannot collide. Plugin
  identity comes from factory options, and error guards reject malformed catalog
  metadata.
- **Nested pipe inspection:** keep the original nested pipe variable for its
  full configuration API; nested entries in `steps` expose a shallow type.

## Contributing and verification

Run the standard checks from the repository root:

```bash
deno task verify
```

This checks formatting, lint, types, JSDoc, README examples, runtime tests,
architecture, coverage, deep type graphs, isolated package consumption and a JSR
publish dry run. It does not publish the package.

Additional focused checks are available:

```bash
deno task test:stress
deno task test:mutation
deno task test:resources
deno task bench
```

See [TESTING.md](TESTING.md) for the CI matrix, thresholds, permissions, failure
replay and benchmark reports. Development tooling does not add runtime
dependencies to the library.

## License

MIT. See [LICENSE](LICENSE).
