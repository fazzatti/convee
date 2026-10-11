/** A general invocation argument tuple. */
export type Args = unknown[];

/** Compatibility inference helper retained for existing type consumers. */
export type NoInfer<T> = globalThis.NoInfer<T>;

/** A value or native Promise resolving to that value. */
export type MaybePromise<T> = T | Promise<T>;

/** Requires one field while allowing the remaining fields to be omitted. */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

/** Intersects all members of a union for shared context inference. */
export type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer Intersection) => void ? Intersection
  : never;
