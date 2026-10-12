import { ConveeError } from "@/error/index.ts";

/** Stable configuration, ownership, binding and preparation failure categories. */
export type WasmErrorCode =
  | "WASM_CONFIG"
  | "WASM_CLOSED"
  | "WASM_CAPACITY"
  | "WASM_REENTRANT"
  | "WASM_LOAD"
  | "WASM_INTEGRITY"
  | "WASM_BINDING"
  | "WASM_UNAVAILABLE"
  | "WASM_APPLICATION"
  | "WASM_CLEANUP";
/**
 * Structured WASM integration failure, visible to ordinary Convee error hooks.
 * Native guest traps retain their original Error identity. Known domain failures
 * use WASM_APPLICATION and retain the generated payload in cause.
 * @remarks Construction creates an Error in the wasm domain; it does not throw it.
 * Inherited serialization bounds diagnostics and does not expose live instances.
 */
export class WasmError extends ConveeError<WasmErrorCode> {
  /**
   * Create a categorized error without throwing it.
   * @param code - Stable category for programmatic recovery.
   * @param message - Human-readable explanation.
   * @param cause - Original failure or domain payload; retained without coercion.
   * @remarks Valid typed arguments do not intentionally throw.
   */
  constructor(code: WasmErrorCode, message: string, cause?: unknown) {
    super({
      domain: "wasm",
      source: "@fifo/convee/wasm",
      code,
      message,
      cause,
    });
    this.name = "WasmError";
  }
}
