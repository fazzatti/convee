function dataField(
  value: object,
  key: string,
  fallback: unknown,
  inherited = false,
): unknown {
  let owner: object | null = value;
  for (let distance = 0; owner !== null && distance < 8; distance++) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) {
      return "value" in descriptor ? descriptor.value : "[Accessor]";
    }
    if (!inherited) break;
    owner = Object.getPrototypeOf(owner);
  }
  return fallback;
}

function errorFields(error: Error): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: dataField(error, "name", "Error", true),
    message: dataField(error, "message", ""),
  };
  for (
    const key of [
      "domain",
      "code",
      "source",
      "details",
      "diagnostic",
      "meta",
      "trace",
      "cause",
    ]
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (descriptor && "value" in descriptor) fields[key] = descriptor.value;
  }
  return fields;
}

export function diagnosticValue(value: unknown): unknown {
  const ancestors = new WeakSet<object>();
  let remaining = 1000;
  function projectArray(value: unknown[], depth: number): unknown[] {
    return Array.from({ length: Math.min(value.length, 100) }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) return undefined;
      return "value" in descriptor
        ? project(descriptor.value, depth + 1)
        : "[Accessor]";
    });
  }
  function project(current: unknown, depth: number): unknown {
    if (typeof current === "bigint") return `${current}n`;
    if (typeof current === "symbol") return String(current);
    if (typeof current === "function") return "[Function]";
    if (current === null || typeof current !== "object") return current;
    if (--remaining < 0 || depth >= 8) return "[Truncated]";
    if (ancestors.has(current)) return "[Circular]";
    ancestors.add(current);
    try {
      if (current instanceof Error) {
        return project(errorFields(current), depth + 1);
      }
      if (Array.isArray(current)) return projectArray(current, depth);
      const result: Record<string, unknown> = Object.create(null);
      for (const key of Object.keys(current).slice(0, 100)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        result[key] = descriptor && "value" in descriptor
          ? project(descriptor.value, depth + 1)
          : "[Accessor]";
      }
      return result;
    } catch {
      return "[Unserializable]";
    } finally {
      ancestors.delete(current);
    }
  }
  return project(value, 0);
}
