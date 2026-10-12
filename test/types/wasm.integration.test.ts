import { pipe, plugin } from "@convee";
import { persistentWasm, wasm } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";
const text = wasm({ bindings: textBindings });
const words: Promise<number> = text.step("countWords")("one two");
const title: Promise<{ words: number; title: string }> = text.step("summarize")(
  "one",
);
const bytes: Promise<Uint8Array> = text.step("echoBytes")(new Uint8Array());
const wide: Promise<bigint> = text.step("echoWide")(1n);
const chain = pipe([
  text.step("countWords"),
  (count: number) => count.toString(),
]);
const result: Promise<string> = chain("one");
const persistent = persistentWasm({ bindings: textBindings });
persistent.step("countWords").use(plugin().onOutput((n: number) => n + 1));
// @ts-expect-error Export names are linked to generated declarations.
text.step("missing");
// @ts-expect-error Inputs preserve generated argument types.
text.step("countWords")(1);
// @ts-expect-error Wide integers are bigint, never lossy JavaScript numbers.
text.step("echoWide")(9007199254740993);
// @ts-expect-error Output inference cannot silently become any.
const wrong: Promise<string> = text.step("countWords")("one");
// @ts-expect-error Plugin output must match the generated export.
persistent.step("countWords").use(plugin().onOutput(() => "wrong"));
void [words, title, bytes, wide, result, wrong];

// @deno-types="@example/rust-host/generated/host.d.ts"
import { instantiate as hostFactory } from "@example/rust-host/generated/host.js";
import { jcoBindings } from "@convee/wasm/jco";
jcoBindings({
  instantiate: hostFactory,
  modules: {},
  // @ts-expect-error Host capabilities must implement the generated import interface.
  imports: () => ({}),
});
