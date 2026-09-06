export function callableFacade<Callable>(
  instance: object,
  names: readonly string[],
): Callable {
  const invoke = (...args: unknown[]): unknown =>
    Reflect.apply(Reflect.get(instance, "run"), instance, args);
  for (const name of names) {
    const value = Reflect.get(instance, name);
    if (typeof value === "function") {
      Object.defineProperty(invoke, name, {
        value: (...args: unknown[]) => {
          const result = Reflect.apply(value, instance, args);
          return result === instance ? invoke : result;
        },
        enumerable: true,
      });
    } else {
      Object.defineProperty(invoke, name, {
        get: () => Reflect.get(instance, name),
        enumerable: true,
      });
    }
  }
  return Object.freeze(invoke) as Callable;
}
