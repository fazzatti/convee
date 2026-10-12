import { WasmError } from "@/wasm/error.ts";
import type { WasmBindings, WasmSession } from "@/wasm/types.ts";

/** One generated core module, optionally pinned to its build-time SHA-256 digest. */
export interface JcoModule {
  /** Absolute asset URL, or a loader returning owned binary bytes. No instance is created. */
  readonly source: URL | (() => Promise<Uint8Array<ArrayBuffer>>);
  /** Lowercase hexadecimal SHA-256. Generated manifests pair glue with exact binary bytes. */
  readonly sha256?: string;
}
/** A typed Jco explicit-instantiation bundle, with application-owned imports. */
export interface JcoOptions<Exports extends object, Imports> {
  /**
   * Generated instantiate function from Jco's async instantiation mode.
   * @param getCoreModule - Bundle-local resolver supplied by Convee.
   * @param imports - Fresh typed host imports supplied by the application factory.
   * @returns An independently owned export object or its initialization promise.
   * @throws Generated initialization/linking errors propagate.
   */
  readonly instantiate: (
    getCoreModule: (path: string) => Promise<WebAssembly.Module>,
    imports: Imports,
  ) => Exports | Promise<Exports>;
  /** Generated core-module paths and sources; all prepare together on preload. */
  readonly modules: Readonly<Record<string, JcoModule>>;
  /**
   * Construct fresh host capabilities for one session.
   * @returns The exact generated import type. Mutable imports must not be shared accidentally.
   * @throws Construction errors reject initialization. Keep imports synchronous for this profile.
   */
  readonly imports: () => Imports;
  /** Explicit proof of a recoverable domain payload; omit to retire on every thrown value. */
  readonly isApplicationError?: WasmSession<Exports>["isApplicationError"];
  /**
   * Release resources belonging to this import object, including failed initialization.
   * @param imports - The successfully constructed per-session host imports.
   * @returns Nothing or completion of asynchronous cleanup.
   * @throws Cleanup errors are retained and prohibit reuse/replacement when cleanup is uncertain.
   */
  readonly disposeImports?: (imports: Imports) => void | Promise<void>;
}

async function read(
  source: JcoModule["source"],
): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof source === "function") return await source();
  if (source.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(await readFile(source));
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new WasmError(
      "WASM_LOAD",
      "WASM asset request failed: " + response.status,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
async function compile(asset: JcoModule): Promise<WebAssembly.Module> {
  const bytes = Uint8Array.from(await read(asset.source));
  if (asset.sha256 !== undefined) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const actual = Array.from(
      digest,
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    if (actual !== asset.sha256) {
      throw new WasmError(
        "WASM_INTEGRITY",
        "WASM asset does not match its generated bindings.",
      );
    }
  }
  return await WebAssembly.compile(bytes);
}
function assets(
  modules: Readonly<Record<string, JcoModule>>,
): [string, JcoModule][] {
  if (!modules || typeof modules !== "object" || Array.isArray(modules)) {
    throw new WasmError(
      "WASM_CONFIG",
      "A Jco bundle requires a module manifest.",
    );
  }
  return Object.entries(modules).map(([path, asset]) => {
    if (
      !path || !asset ||
      !(asset.source instanceof URL || typeof asset.source === "function") ||
      (asset.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(asset.sha256))
    ) {
      throw new WasmError(
        "WASM_CONFIG",
        "Invalid Jco module source or digest.",
      );
    }
    return [path, {
      ...asset,
      source: asset.source instanceof URL
        ? new URL(asset.source)
        : asset.source,
    }];
  });
}
/**
 * Adapt Jco's generated explicit-instantiation factory without importing Jco at runtime.
 * Preload compiles the complete asset manifest but never instantiates. Preparation
 * is shared per adapter, failures are evicted for a later explicit retry, and each
 * create obtains fresh imports and a new export object. No global cache is used.
 * @typeParam Exports - Inferred generated export object, preserved without a handwritten contract.
 * @typeParam Imports - Inferred generated host-import contract.
 * @param options - Matching generated factory, asset manifest, imports and optional cleanup/classifier.
 * @returns Bindings usable by either wasm or persistentWasm, including shared code preparation.
 * @throws WASM_CONFIG synchronously for invalid configuration; loading, digest,
 * compilation and linking failures reject preparation/creation. Unknown module
 * requests reject WASM_BINDING. Cleanup on failed initialization preserves both errors.
 * Use the documented synchronous owned-value profile; resource handles, JSPI,
 * async guest exports and shared/borrowed memory are not supported by this adapter.
 */
export function jcoBindings<Exports extends object, Imports>(
  options: JcoOptions<Exports, Imports>,
): WasmBindings<Exports> {
  if (
    !options || typeof options.instantiate !== "function" ||
    typeof options.imports !== "function" ||
    (options.isApplicationError !== undefined &&
      typeof options.isApplicationError !== "function") ||
    (options.disposeImports !== undefined &&
      typeof options.disposeImports !== "function")
  ) throw new WasmError("WASM_CONFIG", "Invalid Jco factory or callbacks.");
  const entries = assets(options.modules);
  const { instantiate, imports, disposeImports, isApplicationError } = options;
  let prepared: Promise<Map<string, WebAssembly.Module>> | undefined;
  function prepare(): Promise<Map<string, WebAssembly.Module>> {
    return prepared ??= Promise.all(
      entries.map(async ([path, asset]) =>
        [path, await compile(asset)] as const
      ),
    )
      .then((compiled) => new Map(compiled))
      .catch((error) => {
        prepared = undefined;
        throw error;
      });
  }
  return Object.freeze({
    async preload() {
      await prepare();
    },
    async create() {
      const compiled = await prepare();
      const host = imports();
      try {
        const exports = await instantiate((path) => {
          const module = compiled.get(path);
          if (!module) {
            return Promise.reject(
              new WasmError(
                "WASM_BINDING",
                "Generated factory requested an unknown core module.",
              ),
            );
          }
          return Promise.resolve(module);
        }, host);
        return {
          exports,
          isApplicationError,
          dispose: () => disposeImports?.(host),
        };
      } catch (error) {
        try {
          await disposeImports?.(host);
        } catch (cleanup) {
          throw new WasmError(
            "WASM_CLEANUP",
            "Jco initialization and import cleanup failed.",
            new AggregateError([error, cleanup]),
          );
        }
        throw error;
      }
    },
  });
}
