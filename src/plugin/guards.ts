/** Narrow by the callable input hook, not an untrusted supports claim. */
export function hasInput<Value>(
  value: Value,
): value is Value & { input: (...args: unknown[]) => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "input") === "function";
}

/** Narrow by the callable output hook, not an untrusted supports claim. */
export function hasOutput<Value>(
  value: Value,
): value is Value & { output: (...args: unknown[]) => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "output") === "function";
}

/** Narrow by the callable error hook, not an untrusted supports claim. */
export function hasError<Value>(
  value: Value,
): value is Value & { error: (...args: unknown[]) => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "error") === "function";
}

/** Narrow by the callable finalization hook, not an untrusted supports claim. */
export function hasFinally<Value>(
  value: Value,
): value is Value & { finally: () => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "finally") === "function";
}
