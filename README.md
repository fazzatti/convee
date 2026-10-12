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

- `plugin` defines lifecycle hooks for `input`, `output`, `error`, and `finally`
- `step` wraps one callable and owns step-level plugins
- `pipe` composes steps or nested pipes into a typed execution chain
- `createRunContext` carries shared state and execution snapshots
- `ConveeError` and the built-in error catalogs normalize failures
- `parallel` runs intentional worker jobs and joins their results
- `wasm` binds generated WebAssembly exports as ordinary steps

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
- `finally` releases resources after success, recovery, or any hook/body failure
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

Hook-registration order does not determine execution order. Regardless of the
order in which you chain the methods, execution follows input hooks, the body
(with error recovery if needed), output hooks, and finally cleanup hooks.

At least one hook is required. Hook functions and identity are fixed when the
descriptor is created. Pass `id` and `target` through the factory options, not
inside the hook definition. To change behavior, attach a new plugin or remove an
existing registration.

#### Guaranteed cleanup with `onFinally`

Use `onFinally` for resources whose lifetime belongs to a step or pipe
invocation. Unlike `onError`, it also runs when another input, output, or error
hook throws. The invocation does not settle until its asynchronous finalizers
finish.

```ts
import { plugin, step } from "jsr:@fifo/convee";

// Track a resource separately for each invocation, not in a shared scalar.
const resources = new Map<string, { close(): void }>();

const resourceLifetime = plugin({ id: "resource-lifetime" })
  .onInput(function (value: number) {
    const resource = {
      close() {
        console.log("Resource closed");
      },
    };
    resources.set(this.context().runId, resource);
    return value;
  })
  .onFinally(function () {
    const runId = this.context().runId;
    const resource = resources.get(runId);

    // An earlier input hook may have failed before this plugin acquired anything.
    if (!resource) return;

    resources.delete(runId);
    resource.close();
  });

const calculate = step((value: number) => value * 2).use(resourceLifetime);
console.log(await calculate(4)); // Resource closes before this prints 8.
```

The object API is `plugin.for<InputTuple, Output>()({ finally() { ... } })`. A
cleanup-only plugin is valid. `hasFinally(value)`, `plugin.hasFinally(value)`,
and `plugin.sync.hasFinally(value)` narrow by the actual callable hook.
`plugin.sync().onFinally(...)` rejects asynchronous callbacks; runtime checks
also reject promises/thenables supplied through untyped code.

Finalization has these rules:

- Each selected registration finalizes once, in registration order. Persistent
  plugins precede one-off plugins, just as in the other phases. Registering the
  same plugin twice means two finalizer calls, not deduplication by ID.
- All selected finalizers run, including those whose input hooks were skipped
  after an earlier failure. Cleanup must tolerate resources not being acquired.
- Child finalizers complete before execution proceeds to the next child.
  Pipe-level finalizers run when the whole pipe finishes. Targets and captured
  registration lists keep their existing behavior.
- Finalizers receive no arguments. Their invocation context remains available
  during cleanup. Return values cannot transform results or recover errors.
- Without cleanup failures, the result or original error is unchanged. If any
  cleanup fails, every remaining finalizer is still attempted. Convee throws
  `RT_ERRORS.FINALIZATION_FAILED` (`RT_000`) with a native `AggregateError` as
  its `cause`. The aggregate lists the unrecovered execution error first, when
  present, followed by cleanup errors in registration order. Its own `cause`
  points to the first error. Structured metadata retains each cleanup error and
  its plugin trace, with phase `finally`.
- A cleanup failure does not enter that unit's `onError` hooks. An enclosing
  pipe can still observe it as a failure of its child, under normal recovery
  rules. A successfully recovered body error remains in the context snapshot; it
  is not counted as an unrecovered execution error in the aggregate.
- Cleanup is not a timeout or process-crash handler. A never-settling callback
  prevents completion; terminating the process cannot guarantee cleanup.
  Validation before invocation starts, such as an invalid plugin target, does
  not enter the lifecycle or run its finalizers.

`runId` is shared by nested units using the same parent context. The example
owns one resource at one attachment point; do not use `runId` alone to
distinguish separate nested acquisitions of the same resource plugin.

Upgrading from 2.0 to 2.1 requires no changes unless you opt into this hook.
Existing `onError` recovery boundaries remain unchanged.

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

## Concurrent async steps

`concurrent` runs functions, steps and pipelines in the current JavaScript
runtime. It overlaps asynchronous work without workers, module URLs or
structured cloning. Closures, clients, class instances and original task errors
keep their identity. Synchronous CPU work still runs on the caller's thread.

```ts
import { concurrent, plugin, step } from "jsr:@fifo/convee";

const length = step(async (text: string) => text.length);
length.use(plugin().onOutput((value: number) => value + 1));

const summarize = concurrent({
  tasks: {
    length: { run: length, concurrency: 2 },
    title: (text: string) => text.split("\n")[0],
  },
  concurrency: 4,
  maxPending: 100,
  split: ({ tasks }, text: string) =>
    [tasks.length.job(text), tasks.title.job(text)] as const,
  join: ([length, title]) => ({ length, title }),
});

const result = await summarize("Hello\nworld");
console.log(result); // { length: 12, title: "Hello" }
```

Jobs are inert until split completes and the whole batch is admitted. Task
names, arguments and join values are inferred; `as const` preserves
heterogeneous tuple positions. Nested arrays, dynamic arrays and empty plans are
supported. Each descriptor occurrence schedules one invocation. Descriptors
belong to one split invocation and cannot be reused across calls.

The global `concurrency` limit defaults to 8. A task's optional limit operates
within that global capacity. **Limits are shared across calls on the same
definition**, with FIFO dispatch among eligible jobs. `maxPending` defaults to
1,024 active-plus-queued jobs; a batch that will not fit rejects atomically with
`CNC_CAPACITY`. This is bounded admission, not wait-for-space backpressure or a
requests-per-second rate limit. No task is retried automatically.

Tasks retain their slots through native input/output/error/finally hooks. Hooks
attached to the concurrent step wrap the whole split/tasks/join execution; its
outer hooks and join do not occupy task slots. Native child steps/pipelines
share the invocation's parent context while retaining separate execution scopes.
Shared objects and context state remain mutable; application resources still
need their own ownership rules. Avoid awaiting recursive work submitted to the
same exhausted scheduler.

Default `mode: "all"` waits for every task to finish, then either joins ordered
values or rethrows the first original task error in split order. It does not
reject early like `Promise.all`. Use `mode: "collect"` to join ordered
`{ status: "fulfilled", value }` / `{ status: "rejected", error }` outcomes,
including multiple failures and failures from task finalizers.

### Cooperative cancellation and deadlines

```ts
import { concurrent } from "jsr:@fifo/convee";

const readPage = concurrent({
  tasks: {
    read: async (url: string, signal: AbortSignal) => {
      const response = await fetch(url, { signal });
      return await response.text();
    },
  },
  timeoutMs: 5_000,
  split: ({ tasks, signal }, url: string) =>
    [tasks.read.job(url, signal)] as const,
  join: ([text]) => text,
});

const controller = new AbortController();
const text = await readPage.runWith(
  { signal: controller.signal, timeoutMs: 10_000 },
  "https://example.com",
);
console.log(text);
```

Pass the split scope's derived signal to operations that support cancellation.
An external abort or deadline removes queued jobs, signals running work and
skips join if it has not started. The outer error/finally lifecycle runs **after
running tasks finish their actual cleanup**. Error plugins can recover
`CNC_ABORTED` or `CNC_TIMEOUT`. Cancellation takes precedence over task
outcomes, including collect mode.

There is no timeout by default. Positive `timeoutMs` values cover split, queue
wait, task execution and join, after outer input hooks; `runWith` can override
the definition's deadline. JavaScript is never forcibly stopped: an operation
that ignores cancellation, including an already-running split or join, can delay
completion indefinitely. Task capacity is not released early. This API requires
no `close()` or idle-worker policy.

## Worker-backed parallel steps

The optional `@fifo/convee/workers` entrypoint runs a function, step or pipeline
in dedicated workers. A worker definition has **one job**. A `parallel`
operation is an ordinary async Convee step with input/output types, `.use()`,
`.run()` and `.runWith()`. Split, join and outer plugins execute in the caller.

### Define a worker, then use it

The worker file exports its definition directly:

```ts
// word-count.worker.ts
import { worker } from "jsr:@fifo/convee/workers";

export default worker(
  (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
  { module: import.meta.url },
);
```

A different worker can wrap a native pipeline, with its own inner plugins:

```ts
// title.worker.ts
import { pipe } from "jsr:@fifo/convee";
import { worker } from "jsr:@fifo/convee/workers";

export default worker(
  pipe([(text: string) => text.trim(), (text: string) => text.slice(0, 40)]),
  { module: import.meta.url },
);
```

The caller imports those objects. There are no task names or registry generics:

```ts
// documents.ts
import { parallel } from "jsr:@fifo/convee/workers";
import wordCount from "./word-count.worker.ts";
import title from "./title.worker.ts";

export const processDocuments = parallel({
  workers: {
    words: { worker: wordCount, count: 3 },
    titles: { worker: title, count: 4 },
  },
  split: ({ words, titles }, documents: string[]) =>
    documents.map((text) => [words.job(text), titles.job(text)] as const),
  join: (rows) => rows.map(([count, title]) => ({ count, title })),
});

const output = await processDocuments(["Hello world", "Another document"]);
// [{ count: 2, title: "Hello world" }, { count: 2, title: "Another document" }]
```

`words.job` accepts exactly the word-count function's arguments. IntelliSense
knows each group and `join` infers `count: number` and `title: string`. Keep
`as const` on heterogeneous tuple rows: it preserves positional types instead of
widening each position to a union. Nested arrays and readonly tuples retain
their shape, including empty arrays. Splits must be dense, acyclic arrays of
this parallel definition's jobs, nested at most 256 arrays deep.

Counts are independent capacities. Three word-count workers and four title
workers can each run their group's jobs as slots become available. They do not
run in pairs or wait for the matching row. Rows associate **results**, not
worker schedules. A group with two jobs uses at most two active slots,
regardless of its configured count; twenty jobs queue behind the configured
capacity. There is no capacity borrowing between groups. `join` runs once after
all admitted jobs and their caller-side finalizers finish.

Importing a worker definition does not start workers or execute its callable.
The definition module and its dependencies do evaluate in both environments, so
keep module initialization safe in both. `import.meta.url` identifies the file
from inside that file; this standard JavaScript value is supplied once in the
worker definition, never repeated by callers. Functions and closures are loaded
from modules, not serialized into messages. Export one worker definition as the
default of each worker file.

### Three plugin scopes

```ts
import { plugin } from "jsr:@fifo/convee";
import { parallel } from "jsr:@fifo/convee/workers";
import wordCount from "./word-count.worker.ts";

const checked = wordCount.use(
  plugin().onInput((text: string) => text.trim()).onError(() => 0),
);
const countDocuments = parallel({
  workers: { words: { worker: checked, count: 3 } },
  split: ({ words }, documents: string[]) =>
    documents.map((text) => words.job(text)),
  join: (counts) => counts.reduce((sum, count) => sum + count, 0),
}).use(plugin().onFinally(() => console.log("Batch finished")));
```

- Plugins attached to the **inner step or pipeline** execute inside the worker.
- `wordCount.use(plugin)` returns a new definition whose plugins wrap **each job
  in the caller**. Input hooks precede dispatch; output, error and finally hooks
  run after the worker responds or fails. The original definition is unchanged.
  Shared plugin objects can receive concurrent calls.
- `parallel(...).use(plugin)` wraps the **whole invocation**, including split,
  admission, job aggregation and join, using the ordinary mutable Step API.

All three follow native Convee phase and recovery semantics. Body errors can be
recovered; input/output hook failures do not become extra body-recovery passes.
Caller finalizers run after remote failures, including crashes/timeouts. Hard
termination cannot guarantee worker-local finalizers or undo external effects.

### Invocation-owned and persistent lifetimes

Ordinary `parallel` starts fresh resources for each call and terminates them
before that call settles, on success or failure. It has no `close()` method.
Concurrent calls own independent workers and admission budgets. Groups start
lazily when dispatched; an empty split calls join without starting any worker.

For intentional reuse across calls, own a `persistentParallel`:

```ts
import { persistentParallel } from "jsr:@fifo/convee/workers";
import wordCount from "./word-count.worker.ts";

await using counter = persistentParallel({
  workers: { words: { worker: wordCount, count: 3 } },
  split: ({ words }, documents: string[]) =>
    documents.map((text) => words.job(text)),
  join: (counts) => counts,
  reopenOnUse: true,
  idleTimeoutMs: 30_000,
});
await counter.ready(); // Optional: warm every configured instance.
await counter.step(["One document"]);
await counter.step(["Another document"]); // Same generation and capacities.
await counter.close(); // Drain complete invocations, then release workers.
await counter.step(["Later work"]); // Fresh generation because reopenOnUse is true.
// Scope exit permanently disposes counter, including on return or throw.
```

`.step` is the ordinary Step you can compose into pipelines. The owner controls
its lifetime:

| Operation                   | Behavior                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready()`                   | Warm all groups; otherwise workers start lazily.                                                                                                                    |
| `close()`                   | Reject new work, drain accepted invocations through caller hooks and join, then terminate transports. Terminal by default.                                          |
| `reopenOnUse: true`         | A call after completed close starts a fresh generation. Calls during draining still fail.                                                                           |
| `idleTimeoutMs`             | Optional; disabled when omitted. Starts after the last full invocation finishes and applies the same close policy. Pair with reopenOnUse for reusable idle windows. |
| `dispose()` / `await using` | Graceful, permanent close, including for a step retained outside the scope.                                                                                         |
| `terminate()`               | Immediate transport shutdown and permanent closure. Caller hooks already running may still finish.                                                                  |

`await using` is optional; explicit `try/finally { await owner.dispose(); }`
provides equivalent ownership. A definition created inside a function has a new
lifetime on every function call. Garbage collection cannot provide reliable
cleanup. Call close/dispose from outside an active invocation, not by awaiting
its own owner from a hook or join, which would wait for itself to finish.
Cleanup attempts every transport; failed cleanup is reported and never silently
reopens that owner.

Worker module/closure state persists across jobs on the same instance. Separate
instances do not share that state, and a replacement/reopened generation starts
fresh. Do not rely on routing a later job to the same instance. Per-job Convee
context is always fresh.

### Results, errors and context

The default `mode: "all"` waits for every admitted job's full caller lifecycle.
Unrecovered failures skip join and produce `WRK_BATCH`; `meta.failures` and its
`AggregateError` cause retain individual errors. Successful job recovery counts
as a fulfilled result. Use collect to handle mixed outcomes yourself:

```ts
import { parallel } from "jsr:@fifo/convee/workers";
import wordCount from "./word-count.worker.ts";

const collectCounts = parallel({
  workers: { words: { worker: wordCount, count: 2 } },
  mode: "collect",
  split: ({ words }, texts: string[]) =>
    texts.map((text) =>
      words.job(text).withContext({
        seed: { requestId: "req-42" },
        capture: "none",
      })
    ),
  join: (outcomes) =>
    outcomes.map((outcome) =>
      outcome.status === "fulfilled"
        ? outcome.value
        : { error: outcome.error.message }
    ),
});
```

Collect preserves the same nested shape, replacing each job with a typed
`{ status: "fulfilled", value }` or `{ status: "rejected", error }`. Admission
and split errors reject the whole invocation even in collect mode. A join error
enters the outer Step's error/finally lifecycle.

`.withContext({ seed, capture })` supplies explicit cloneable data to the fresh
worker-local context. Capture defaults to `none`. The caller's live context and
plugins are not copied, and worker state changes/history do not merge back. Use
normal function syntax and native `this.context()` inside the worker when
accessing that context.

Remote errors provide bounded, data-only name, message, stack, code, domain,
source, metadata and cause diagnostics through `WorkerError.meta.remote`.
Prototypes, identity and arbitrary properties are not recreated. Infrastructure
errors carry group, worker and job/path identity when available. Ordinary task
exceptions do not poison the worker.

### Capacity and recovery

`maxPending` defaults to 1024 and bounds all admitted job leaves, including jobs
still in caller input/output/error/finally hooks. A persistent generation shares
one limit across groups and overlapping invocations. A complete batch is
validated, snapshotted and admitted atomically before any job hook runs; a batch
that does not fit rejects with `WRK_CAPACITY` instead of partially executing.
Released slots can accept later batches while other jobs remain active.

Each group accepts `startupTimeoutMs` (default 10000), `timeoutMs` (default
30000), and `maxRestarts` (default 2; zero disables replacement). Startup
includes construction, module loading and readiness. Execution timeout runs from
dispatch to reply, including inner hooks; it excludes queue wait and caller
hooks.

Initial startup failures fail that group without automatic retry. A later crash,
protocol failure or execution timeout fails the active job without replaying it,
awaits termination, then may replace the instance for subsequent queued work.
Extra start attempts consume one shared budget per group generation, including
failed replacements. Exhaustion closes that group; collateral jobs fail with
`WRK_UNAVAILABLE`. Other groups continue and completed results remain intact. A
later batch referring to an unavailable group is rejected atomically. A
successful close/reopen starts a new generation and budget; failures alone do
not reset it. No automatic job retry is performed because work may have effects.

Arguments and explicit context are snapshotted with structured cloning at
admission; messages and replies cross the boundary again. Caller input hooks
must also return cloneable values. There is no implicit transfer list or buffer
detachment. `SharedArrayBuffer` retains native shared-memory semantics and
requires application synchronization. Worker startup and transport have real
costs; persistent reuse amortizes startup, not per-job serialization. No
workload-independent speedup is promised.

### Runtime and build integration

Built-in transports select Deno module workers, Node/Bun `worker_threads`, or
browser module workers. Node termination is awaited. There is no fallback that
quietly executes jobs on the caller thread. Importing the core entrypoint never
loads worker infrastructure. Each host still needs permission and a loader for
its application modules; Node/Bun conformance runs against compiled ESM, and
Deno also exercises TypeScript directly.

Vite applications install the optional integration to emit discoverable worker
entries in both development and production:

```ts
import { conveeWorkers } from "jsr:@fifo/convee/workers/vite";

export default { plugins: [conveeWorkers()] }; // vite.config.ts
```

Use the same worker-file and caller syntax shown above. With a package installed
through your runtime's package tooling, imports can use `@fifo/convee/workers`
and `@fifo/convee/workers/vite`. The Vite plugin recognizes named `worker`
imports (including aliases) and the literal `{ module: import.meta.url }`
options. Keep this syntax in the worker file; arbitrary re-export wrappers and
namespace imports are not build entry declarations. Existing Vite worker plugins
are retained. Conformance covers development and production in Chromium, Firefox
and WebKit; WebKit testing is not a Safari-release certification.

For another build tool or runtime, `createWorker(entry, slot)` is a typed
adapter hook returning an EventTarget transport with `postMessage` and
`terminate`. The supplied entry is a Convee bootstrap, not the raw definition
module. Asynchronous construction must honor `slot.signal` and release failed
setup. A constructor still unresolved at its startup deadline reports
unconfirmed cleanup rather than hanging indefinitely; late returned transports
are stopped. Termination must settle only after actual cleanup. Runtime support
is verified by real consumers, not by the mere existence of a global `Worker`
constructor.

## WASM-backed steps

The optional `@fifo/convee/wasm` entrypoint turns generated WASM exports into
ordinary async steps. Rust bindings use the optional `/wasm/jco` adapter;
neither entrypoint adds Rust, Jco or WASI to Convee's runtime dependencies.

### Bind an export

The examples use the checkout's `@example/` alias. In your application, import
your own generated binding descriptor instead:

```ts
import { plugin } from "jsr:@fifo/convee";
import { wasm } from "jsr:@fifo/convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

const text = wasm({ bindings: textBindings });
const summarize = text.step("summarize", { id: "summary" })
  .use(plugin().onInput((text: string) => text.trim()));
console.log(await summarize("  Hello Rust  ")); // { words: 2, title: "Hello Rust" }
```

Export names, argument tuples, results and compatible plugins are inferred from
generated declarations. A bound step supports the normal `.use()`, `.remove()`,
`.run()` and `.runWith()` APIs, contexts and all four plugin gates. Bind
different exports as separate steps to preserve hooks between pipeline stages.

### Loading and instance lifetime

`wasm()` creates a fresh guest session for each invocation and releases it after
user finalizers, before the call settles. Sharing a binding descriptor reuses
prepared code without sharing live guest state. The `.wasm` file contains
portable bytecode; the host still prepares it for execution on its CPU.

| Option or method           | Behavior                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `loading: "lazy"`          | Default: prepare code on first use.                                                                                                   |
| `loading: "eager"`         | Start preparation when the resource is defined, without creating a guest.                                                             |
| `await resource.preload()` | Await code preparation without creating a guest or calling exports.                                                                   |
| `maxPending`               | Default 1024: bound admitted calls across this resource's steps, through hooks and finalizers. Overload rejects with `WASM_CAPACITY`. |

Jco preparation is shared per binding descriptor, including concurrent requests.
A failed preparation can be retried on the next request. Await `preload()` to
observe eager failures; background preparation does not leave an unhandled
rejection. Engines may still compile or optimize functions on later calls.

For intentional state reuse, own a `persistentWasm`:

```ts
import { persistentWasm } from "jsr:@fifo/convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

await using persistent = persistentWasm({
  bindings: textBindings,
  reopenOnUse: true,
  idleTimeoutMs: 30_000,
  maxRestarts: 2,
});
await persistent.preload(); // Prepare reusable code only.
await persistent.ready(); // Also initialize the guest; otherwise it starts lazily.
const increment = persistent.step("increment");
console.log(await increment(), await increment()); // 1, 2
await persistent.close(); // Drain accepted calls and release guest state.
console.log(await increment()); // 1: reopening creates a fresh generation.
// Scope exit permanently disposes the owner, including retained steps.
```

The persistent owner shares one session across its steps. Guest execution is
exclusive; hooks may overlap. `maxPending` bounds their complete lifecycles.
`close()` is idempotent and rejects new calls while draining. Reopening defaults
to false; when enabled, it starts only after a successful close. Idle timeout is
optional and starts after the last call or warmup finishes, using the same close
policy. `dispose()` and `await using` are always terminal.

Explicit `try/finally` disposal is an alternative to `await using`. Do not await
close/dispose from the owner's own hooks, or reacquire it from its imports or
initialization/cleanup callbacks. These operations would wait for themselves;
synchronous guest reentry rejects with `WASM_REENTRANT`. Failed cleanup prevents
replacement and reopening. Releasing references does not force immediate GC.

### Rust bindings and host imports

Define the public contract in WIT, implement its generated `Guest` trait with
Rust's `wit-bindgen`, then generate JavaScript factories and TypeScript
declarations with Jco's explicit instantiation mode. The
[Rust text example](https://github.com/fazzatti/convee/tree/dev/examples/rust-text)
includes the WIT, Rust source, build script, generated files and binding
descriptor. To build and run the examples with Rust 1.96.0, Node 22.12+ and
Deno:

```sh
rustup target add wasm32-unknown-unknown
deno task wasm:build
deno run --allow-read=examples --allow-env=JCO_DEBUG examples/rust-text/main.ts
```

The build pins wit-bindgen 0.62.0 and Jco 1.37.0 and emits an async
`instantiate` factory plus a `modules.ts` asset manifest. Pass both to
`jcoBindings`. Imports are typed by the generated contract and created afresh
for each session; this
[host example](https://github.com/fazzatti/convee/tree/dev/examples/rust-host)
supplies a counter:

```ts
import { jcoBindings } from "jsr:@fifo/convee/wasm/jco";
// @deno-types="@example/rust-host/generated/host.d.ts"
import { instantiate } from "@example/rust-host/generated/host.js";
import { modules } from "@example/rust-host/generated/modules.ts";

const hostBindings = jcoBindings({
  instantiate,
  modules,
  imports: () => {
    let value = 0;
    return { "next-value": { default: () => ++value } };
  },
});
```

Import-free components use `imports: () => ({})`. Add `disposeImports(imports)`
to release host resources, including after failed instantiation. If the imports
factory itself throws, it must clean up its partial allocations.

Manifest keys match the generated core-module paths. Each entry accepts a
`source` URL or async byte loader and an optional lowercase SHA-256 digest.
Generated manifests resolve URLs internally, so callers need not repeat
`import.meta.url`. HTTP assets use fetch; `file:` assets use filesystem loading
on Deno/Node/Bun. Deploy matching glue, declarations and **all** core assets
together. Digests check bytes, not the trustworthiness of the JavaScript glue.

Other toolchains can implement `WasmBindings<Exports>`: `preload()` prepares
reusable code, and `create()` returns an independent session with typed
`exports`, optional `isApplicationError` and `dispose`. The adapter owns ABI
conversion and partial-setup cleanup; a singleton binding cannot provide fresh
session isolation.

### Values, errors and recovery

The Rust profile supports synchronous top-level WIT functions with owned
scalars, strings, lists, records, tuples, enums, flags, variants, options,
results and aliases, using memory32 and UTF-8. `u64`/`s64` use `bigint` and
numeric lists use typed arrays. Function Results unwrap success or throw their
error payload; nested Results remain tagged values. Outputs are copied before
output hooks, so later calls or memory growth cannot overwrite retained values.

Jco can coerce inputs, including integer wrapping and Unicode replacement. Add
input plugins for stricter application validation; TypeScript does not validate
numeric ranges or binary compatibility. Exported resources, borrowed or shared
memory, guest async/streams/JSPI, threads and implicit WASI are outside this
profile. Namespaced interface objects are not step names. The pinned validator
also rejects empty records and flags with more than 32 members.

`isApplicationError(error)` explicitly identifies domain failures that leave a
session safe to reuse; they become `WASM_APPLICATION` with the original payload
in `cause`. Its classifier must match the actual guest and host-import contract.
Omit it to retire on every exception. Traps, unknown exceptions, codec failures
and uncloneable/shared-memory outputs retire unsafe state before error recovery.
A fallback does not repair the retired instance.

Persistent `maxRestarts` allows two extra starts per generation by default; zero
disables replacement. Failed replacements consume this budget, successful calls
do not reset it, and only queued/future calls use replacements. Failed work is
never replayed. Initial startup failure ends the generation; a successful
explicit close/reopen starts a new one. Cleanup failures prevent unsafe reuse.

`WasmError` provides stable `WASM_*` codes for configuration, loading,
integrity, binding, capacity, lifecycle and cleanup errors. Native traps retain
their original error. Explicit `preload()`/`ready()` reject directly; errors
during step execution follow native body-recovery and finalization rules.

### Runtimes and workers

Deno, Node and Bun support the generated bindings; browser consumers cover Vite
development and production in Chromium, Firefox and WebKit. Other bundlers and
edge hosts need their own integration. Deno requires read/network permission for
assets and `--allow-env=JCO_DEBUG` for the pinned glue. Browser assets need
normal fetch/CORS/CSP access. WASI-dependent crates need explicit host adapters.

Wrap a WASM step in an ordinary `worker(...)` definition, as in
[document.worker.ts](https://github.com/fazzatti/convee/blob/dev/examples/rust-text/document.worker.ts),
then use it with `parallel` or `persistentParallel`. Keep descriptors lazy:
worker definition modules also evaluate in the caller. Caller preload does not
warm worker isolates, and a persistent parallel owner's `ready()` starts workers
without warming their lazy guests.

A persistent guest captured inside a worker lasts for that worker generation.
Termination releases the isolate but cannot guarantee its host-resource cleanup
or roll back effects; there is no automatic callback to dispose a captured
owner. Synchronous WASM cannot be interrupted by a same-thread timer or disposal
call. Use worker timeouts/termination when hard interruption is required.

WASM is not an automatic speedup. Include generated glue and asset sizes, cold
preparation, instantiation, conversion/copying, worker messaging and peak memory
when measuring your workload; small calls may cost more than JavaScript.

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

## License

MIT. See [LICENSE](LICENSE).
