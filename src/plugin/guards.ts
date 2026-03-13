type InputLike = { input: (...args: unknown[]) => unknown };
type OutputLike = { output: (...args: unknown[]) => unknown };
type ErrorLike = { error: (...args: unknown[]) => unknown };

/**
 * Narrows a plugin to one that implements an `input` hook.
 */
export function hasInput<T>(value: T): value is T & InputLike {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "supports") === "function"
  ) {
    return Reflect.apply(
      Reflect.get(value, "supports") as (capability: string) => boolean,
      value,
      ["input"],
    );
  }

  return value !== null && typeof value === "object"
    ? typeof Reflect.get(value, "input") === "function"
    : false;
}

/**
 * Narrows a plugin to one that implements an `output` hook.
 */
export function hasOutput<T>(value: T): value is T & OutputLike {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "supports") === "function"
  ) {
    return Reflect.apply(
      Reflect.get(value, "supports") as (capability: string) => boolean,
      value,
      ["output"],
    );
  }

  return value !== null && typeof value === "object"
    ? typeof Reflect.get(value, "output") === "function"
    : false;
}

/**
 * Narrows a plugin to one that implements an `error` hook.
 */
export function hasError<T>(value: T): value is T & ErrorLike {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "supports") === "function"
  ) {
    return Reflect.apply(
      Reflect.get(value, "supports") as (capability: string) => boolean,
      value,
      ["error"],
    );
  }

  return value !== null && typeof value === "object"
    ? typeof Reflect.get(value, "error") === "function"
    : false;
}
