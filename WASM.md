# Rust and WebAssembly

WASM exports become ordinary async Convee steps, with native plugins, contexts
and pipes. The optional entrypoints are `@fifo/convee/wasm` and
`@fifo/convee/wasm/jco`. They do not add Jco, Rust or WASI to the core runtime.

## Run the examples

Install Rust 1.96.0 with its `wasm32-unknown-unknown` target, Node >=22.12
(tested with 24.1.0), and Deno. From this checkout:

```sh
rustup target add wasm32-unknown-unknown
deno task wasm:build
deno task test:wasm
deno run --allow-read=examples --allow-env=JCO_DEBUG examples/rust-text/main.ts
```

The build uses locked Cargo dependencies, wit-bindgen 0.62.0 and Jco 1.37.0. It
builds all three Rust examples and a two-core WAT fixture, converts core modules
to components, then generates JS factories, TypeScript declarations and SHA-256
asset manifests. No global Jco or wasm-tools installation is needed. CI rebuilds
these actual Rust sources and runs the consumer tests against the regenerated
output. Committed generated fixtures let ordinary SDK tests run without a Rust
compiler.

- [rust-text](https://github.com/fazzatti/convee/blob/dev/examples/rust-text/src/lib.rs)
  implements word counting, document summaries, structured domain errors, bytes,
  optional strings, a full-width integer, a stateful counter and an intentional
  panic for recovery tests.
- [rust-host](https://github.com/fazzatti/convee/blob/dev/examples/rust-host/src/lib.rs)
  calls an explicit host capability. Its tests verify fresh host closures and
  cleanup per session.
- [rust-abi](https://github.com/fazzatti/convee/blob/dev/examples/rust-abi/src/lib.rs)
  exercises every owned-value type family, canonical layout boundaries and a
  rich host import. Its three generated core modules are tested together.
- [component-pair](https://github.com/fazzatti/convee/blob/dev/examples/component-pair/pair.wat)
  links two core modules and deliberately emits malformed characters, UTF-8 and
  memory ranges to verify generated lifting failures and instance retirement.

The WIT contract is compiler-checked against the Rust implementation, and Jco
generates the matching TypeScript types. Deploy generated glue, declarations and
every core asset together. Asset digests detect mismatched binary bytes; they do
not authenticate untrusted JavaScript or establish application correctness.

## Use typed steps

In the example checkout, aliases are defined in `deno.json`:

```ts
import { wasm } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

const text = wasm({ bindings: textBindings }); // No instance or binary loading.
await text.preload(); // Optional code preparation; no guest initialization.
const summarize = text.step("summarize");
const result = await summarize("Hello Rust"); // { words: 2, title: "Hello Rust" }
```

Names, argument tuples and return values come from generated declarations.
Unknown names, incorrect input types and incompatible plugins fail type
checking. Each invocation owns a fresh instance. Multiple exports may be
separate steps in one native pipeline, retaining every input, output, error and
finally gate.

`loading: "eager"` starts preparation immediately, without creating an instance.
`preload()` awaits preparation and deduplicates concurrent requests through the
bindings. A failed preparation is retried by the next preparation/creation
request. Eager failures are handled internally to avoid unhandled rejections;
await preparation to observe errors. Engine lazy compilation/tiering may still
occur on first or hot calls.

## Own persistent state deliberately

```ts
import { persistentWasm } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

await using text = persistentWasm({
  bindings: textBindings,
  maxPending: 1024,
  maxRestarts: 2,
  reopenOnUse: true,
  idleTimeoutMs: 30_000,
});
await text.ready(); // Optional: preparation plus instance initialization.
const increment = text.step("increment");
console.log(await increment(), await increment()); // 1, 2
await text.close(); // Stop admission, drain hooks/finalizers, release state.
console.log(await increment()); // 1: a new generation, because reopening is enabled.
```

The default `reopenOnUse` is false and there is no default idle timer. Close is
idempotent; calls during draining reject. `dispose()` and `await using` are
always terminal, including for previously obtained steps. An idle deadline
starts only after all admitted calls/warmups finish. If idle cleanup is
asynchronous, a call during that drain rejects; reopening begins only after
cleanup completes. Do not await close/dispose from an owner's own hook: it waits
for that hook.

Persistent calls share one bounded admission budget across all bound steps.
Input/output/finally hooks can overlap, but guest execution is exclusive.
Capacity is held through the complete native lifecycle, and overload rejects
without an unbounded secondary queue. Guest imports must not reacquire the same
owner; synchronous reentry rejects. Custom asynchronous initialization/cleanup
must also avoid reacquiring their owner.

Generated outputs are copied to owned JavaScript values before output hooks run.
Later calls and guest memory growth cannot overwrite them. Shared memory outputs
and uncloneable handles reject. Closing drops owned references and releases host
resources; JavaScript GC controls actual memory reclamation.

## Bind generated factories and explicit imports

`jcoBindings({ instantiate, modules, imports })` infers both sides of the
generated contract. The build example emits `modules.ts` with asset URLs and
digests, so the calling application does not repeat paths or use
`import.meta.url`. Native URL resolution remains inside the generated
descriptor. URLs use fetch on the web and filesystem loading for `file:` under
Deno/Node/Bun. A module entry can instead supply an async byte loader for custom
hosts.

The `imports` callback runs once per session and must create fresh mutable
capabilities. `disposeImports` releases those capabilities, including after
failed instantiation. If the imports callback itself throws, it must clean any
partial allocation it made. Failed cleanup prevents replacement or reopening.

`isApplicationError(error)` is an explicit adapter contract, not a heuristic
based on an exception's name. The text example recognizes its declared Result
payloads because its world has no host imports that could throw lookalikes. Such
failures become `WASM_APPLICATION` errors whose `cause` preserves the payload.
Applications with imported capabilities must classify errors according to their
actual generated ABI and host contract. Omit the classifier for conservative
retirement on every exception. Native WASM traps always retire the instance.

Unknown exceptions, traps, codec errors and unsupported outputs retire unsafe
state before outer error recovery. A fallback never repairs that state. The
default replacement budget is two extra starts per generation, including failed
starts. Only queued/future work uses replacements; failed work is never
replayed. Successful calls do not reset the budget. Initial startup failure ends
that generation. Explicit close/reopen creates a new generation; failure alone
never triggers reopening or bypasses the restart limit.

## Supported profile and runtime limits

The initial Rust profile uses synchronous, top-level WIT function exports with
owned scalars, strings, lists, records, tuples, enums, flags, variants, options,
results and aliases, using memory32 and UTF-8. `u64`/`s64` map to `bigint`;
other conversions follow the generated Jco/WIT ABI. TypeScript does not
establish numeric ranges or prove that a supplied binary matches an interface.
Use the generated artifacts and test boundary behavior. Convee invocations
remain asynchronous for preparation and lifecycle work.

The [ABI conformance inventory](TESTING.md#abi-conformance-inventory) states the
tested type/value boundaries, invalid inputs, malformed outputs and exclusions.
Jco may coerce scalar inputs (including integer wrapping and Unicode
replacement) rather than rejecting them. Add input plugins when your application
needs stricter validation. The pinned validator rejects empty records and more
than 32 flags; arbitrary nesting and alternate encoding/toolchain combinations
are not exhaustively tested.

Exported resource handles, borrowed/shared memory, guest async/streams, JSPI and
threading are outside this profile. Namespaced interface objects are not step
names; use top-level WIT functions or an explicit custom binding adapter.
WASI-dependent crates require deliberate host adapters; the portable text
example needs none. There is no promise that arbitrary Rust crates work on every
host.

Deno, Node and Bun execute the real generated fixtures. Browser consumer tests
cover Chromium, Firefox and WebKit with Vite development and production builds,
both directly and inside Convee workers. Other bundlers and edge hosts require
their own adapter/consumer verification. Deno needs read permission for local
assets and, for this pinned Jco-generated runtime, `--allow-env=JCO_DEBUG`. HTTP
assets need the corresponding network permission. Browsers need their normal
fetch/CORS/CSP permissions. WebKit testing is not Safari certification.

## Combine with intentional workers

See
[document.worker.ts](https://github.com/fazzatti/convee/blob/dev/examples/rust-text/document.worker.ts):
its default export wraps exactly one WASM-backed step. Use it with ordinary
`parallel` or `persistentParallel`; no special WASM worker scheduler is
introduced.

Worker definition modules also evaluate in the caller. Keep WASM descriptors
lazy to avoid unnecessary caller preparation. A caller's preload does not warm
worker isolates, and parallel.ready initializes workers, not their lazy guests.
If a worker intentionally owns an import-free persistent guest, its state lasts
for that worker generation; worker termination releases the isolate. Arbitrary
host capabilities may need an application-level graceful cleanup protocol. There
is no automatic worker shutdown callback for a captured WASM owner.

Synchronous WASM cannot be interrupted by a same-thread timer or disposal call.
Use existing worker timeouts/termination for hard interruption. Termination
cannot guarantee guest cleanup or roll back already performed host effects.

## Measure the whole operation

No speedup is promised. Measure generated JS plus all WASM assets, cold
preparation/instantiation, warm computation, conversion/copying, worker overhead
and peak memory. Tiny calls can cost more than ordinary JavaScript. The examples
validate behavior; they are not a performance benchmark.

Generated Jco runtime code is covered by the upstream
[license](https://github.com/fazzatti/convee/blob/dev/examples/JCO-LICENSE). Its
fixture code is integration-tested; the strict production coverage gate measures
every authored Convee module, including both optional WASM entrypoints.
