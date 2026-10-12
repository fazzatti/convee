import { worker } from "@convee/workers";
import { wasm } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

const text = wasm({ bindings: textBindings });
export default worker(text.step("summarize"), { module: import.meta.url });
