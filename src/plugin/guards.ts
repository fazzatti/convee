/**
 * Check whether a value exposes a callable `input` lifecycle hook.
 *
 * @param value - Unknown object, function or primitive to inspect.
 *
 * @returns True when the named property is callable, narrowing its structural type.
 * The hook is not invoked and its signature, result and behavior are not validated.
 * @throws Exceptions from reading a getter or proxy trap for the hook propagate.
 */
export function hasInput<Value>(
  value: Value,
): value is Value & { input: (...args: unknown[]) => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "input") === "function";
}

/**
 * Check whether a value exposes a callable `output` lifecycle hook.
 *
 * @param value - Unknown object, function or primitive to inspect.
 *
 * @returns True when the named property is callable, narrowing its structural type.
 * The hook is not invoked and its signature, result and behavior are not validated.
 * @throws Exceptions from reading a getter or proxy trap for the hook propagate.
 */
export function hasOutput<Value>(
  value: Value,
): value is Value & { output: (...args: unknown[]) => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "output") === "function";
}

/**
 * Check whether a value exposes a callable `error` lifecycle hook.
 *
 * @param value - Unknown object, function or primitive to inspect.
 *
 * @returns True when the named property is callable, narrowing its structural type.
 * The hook is not invoked and its signature, result and behavior are not validated.
 * @throws Exceptions from reading a getter or proxy trap for the hook propagate.
 */
export function hasError<Value>(
  value: Value,
): value is Value & { error: (...args: unknown[]) => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "error") === "function";
}

/**
 * Check whether a value exposes a callable `finally` lifecycle hook.
 *
 * @param value - Unknown object, function or primitive to inspect.
 *
 * @returns True when the named property is callable, narrowing its structural type.
 * The hook is not invoked and its signature, result and behavior are not validated.
 * @throws Exceptions from reading a getter or proxy trap for the hook propagate.
 */
export function hasFinally<Value>(
  value: Value,
): value is Value & { finally: () => unknown } {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "finally") === "function";
}
