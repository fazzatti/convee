// world root:component/root
export interface Summary {
  words: number,
  title: string,
}
export type Failure = FailureEmpty | FailureTooLong;
export interface FailureEmpty {
  tag: 'empty',
}
export interface FailureTooLong {
  tag: 'too-long',
  val: number,
}
export interface ImportObject {
}
export interface Root {
  countWords(text: string): number,
  summarize(text: string): Summary,
  echoBytes(bytes: Uint8Array): Uint8Array,
  echoWide(value: bigint): bigint,
  optionalTitle(text: string | undefined): string | undefined,
  increment(): number,
  trap(): void,
}
export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

/**
* Instantiates this component with the provided imports and
* returns a map of all the exports of the component.
*
* This function is intended to be similar to the
* `WebAssembly.Instantiate` constructor. The second `imports`
* argument is the "import object" for wasm, except here it
* uses component-model-layer types instead of core wasm
* integers/numbers/etc.
*
* The first argument to this function, `getCoreModule`, is
* used to compile core wasm modules within the component.
* Components are composed of core wasm modules and this callback
* will be invoked per core wasm module. The caller of this
* function is responsible for reading the core wasm module
* identified by `path` and returning its compiled
* `WebAssembly.Module` object. This would use the
* `WebAssembly.Module` constructor on the web, for example.
*/
export function instantiate(
getCoreModule: (path: string) => WebAssembly.Module,
imports: ImportObject,
instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance
): Root;
export function instantiate(
getCoreModule: (path: string) => WebAssembly.Module | Promise<WebAssembly.Module>,
imports: ImportObject,
instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance | Promise<WebAssembly.Instance>
): Root | Promise<Root>;

