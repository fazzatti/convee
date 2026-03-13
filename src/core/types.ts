export type Args = unknown[];

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type MaybePromise<T> = T | Promise<T>;

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

export type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;
