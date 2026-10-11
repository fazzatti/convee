type Field = "string" | "number" | "strings" | "optional-string" | "unknown";

export function matchesMeta(
  value: unknown,
  fields: Record<string, Field>,
): boolean {
  if (value === null || typeof value !== "object") return false;
  try {
    return Object.entries(fields).every(([key, kind]) => {
      const field = Reflect.get(value, key);
      if (kind === "unknown") return Object.hasOwn(value, key);
      if (kind === "optional-string") {
        return field === undefined || typeof field === "string";
      }
      if (kind === "strings") {
        return Array.isArray(field) &&
          field.every((item) => typeof item === "string");
      }
      return kind === "number"
        ? typeof field === "number"
        : typeof field === "string";
    });
  } catch {
    return false;
  }
}
