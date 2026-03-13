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

## Architecture

### Plugins

Plugins are lifecycle wrappers. They do not execute by themselves. A plugin becomes useful when you attach it to a step or a pipe.

Plugin capabilities:

- `input` transforms the incoming arguments before the wrapped unit runs
- `output` transforms the produced result after the wrapped unit finishes
- `error` recovers from a failure or replaces it with another error
- `id` gives the plugin a stable identity for inspection and removal
- `target` scopes the plugin to a specific direct step when used in a pipe
- `supports(...)` checks whether a plugin implements a given lifecycle hook
- `targets(...)` checks whether a plugin applies to a given step id

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
const audit = plugin({ id: "audit" })
  .onInput((value: number) => value)
  .onOutput((value: number) => value);
```

### Steps

A step wraps one function but still behaves like a callable function. The returned value is both:

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

That direct-call shape is intentional: steps compose like normal functions, but they keep the runtime controls needed for plugins and context-aware execution.

Attach persistent plugins with `use(...)`:

```ts
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

Or attach one-off plugins with `runWith(...)`:

```ts
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
```

### Pipes

A pipe also stays callable after composition. The returned value is both:

- a callable runtime for the whole chain
- a pipe object with step inspection, plugin management, and advanced run controls

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

A pipe composes steps, nested pipes, or raw functions. Raw functions are wrapped as steps automatically, so the pipeline always runs over step-like units internally.

```ts
import { pipe, step } from "jsr:@fifo/convee";

const add = step((value: number) => value + 1, { id: "add" });
const double = (value: number) => value * 2;

const numberPipe = pipe([add, double], {
  id: "number-pipe",
});

await numberPipe(2); // 6
```

That means you keep function-style composition at the edges while still getting step ids, plugin targets, and typed execution controls inside the pipe.

Pipes accept pipe-level plugins and plugins targeted at direct inner steps:

```ts
import { pipe, plugin, step } from "jsr:@fifo/convee";

const add = step((value: number) => value + 1, { id: "add" } as const);
const double = step((value: number) => value * 2, { id: "double" } as const);

const numberPipe = pipe([add, double], {
  id: "number-pipe",
} as const);

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

Targeted inner-step plugins are scoped to the pipe that owns them. Reusing the same step in another pipe does not leak plugins across pipelines.

### Run Context

Every run can carry shared state plus captured snapshots for steps and plugins.

Context capabilities:

- `state` stores shared mutable values for the current run tree
- `step.current()` reads the step that is executing right now
- `step.get(id)` reads the captured snapshot for a specific step
- `step.all()` reads every captured step snapshot for the run
- `plugin.current()` reads the plugin that is executing right now
- `plugin.get(id)` reads the captured snapshot for a specific plugin
- `plugin.all()` reads every captured plugin snapshot for the run
- `runId` identifies the current run
- `rootRunId` identifies the root run when execution is nested
- `capture` controls whether snapshots store only outputs or full input/output/error data

```ts
import {
  createRunContext,
  step,
  type StepThis,
} from "jsr:@fifo/convee";

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

Use `withContext<Shared>()` on `plugin`, `step`, or `pipe` when you want `this.context()` to expose a typed shared state shape.

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

## Error Model

Convee normalizes runtime failures into structured errors.

- `ConveeError` is the common error type
- `PLG_ERRORS` contains plugin-domain creators
- `STP_ERRORS` contains step-domain creators
- `PIP_ERRORS` contains pipe-domain creators

Error hooks can recover:

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

And consumers can narrow failures:

```ts
import { STP_ERRORS, isConveeErrorOf, step } from "jsr:@fifo/convee";

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

## Design Notes

### Pipes compose plain values

Convee does not need a container, decorator system, or framework lifecycle. A pipe is a typed chain from one output shape to the next input shape, and the final runtime is still callable like a normal function.

```ts
const pricePipe = pipe([
  (value: number) => value * 100,
  (value: number) => `${value} cents`,
]);

await pricePipe(12.5); // "1250 cents"
await pricePipe.run(12.5); // "1250 cents"
```

### Plugins stay explicit

Plugins do nothing until you attach them. That makes behavior visible at the call site and avoids hidden global middleware.

```ts
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

### Context flows through parent runs

Nested steps and nested pipes share state by receiving a parent run context. That gives you one place to keep trace data, request-scoped values, or step snapshots without relying on globals.

```ts
const traceStep = step.withContext<{ trace: string[] }>()(function (value: number) {
  this.context().state.set("trace", [
    ...(this.context().state.get("trace") ?? []),
    `value:${value}`,
  ]);

  return value * 2;
});

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

The package root focuses on the runtime primitives and the types that directly support them. Internal inference helpers can still exist inside the library, but the main entrypoint stays centered on the surface consumers should actually build against.

```ts
import {
  createRunContext,
  pipe,
  plugin,
  step,
} from "jsr:@fifo/convee";
```

## License

MIT. See [LICENSE](LICENSE).
