import { pipe } from "@convee";
import { persistentWasm, wasm } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

const text = wasm({ bindings: textBindings });
await text.preload();
const document = pipe([
  text.step("countWords"),
  (words: number) => ({ words, label: words + " words" }),
]);
console.log(await document("Hello from Rust"));

await using persistent = persistentWasm({ bindings: textBindings });
const increment = persistent.step("increment");
console.log(await increment(), await increment()); // 1, 2
