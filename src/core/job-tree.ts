/** Rebuild one level in split order. Recursion and leaf lookup use this same association. */
export function mapChildren<T, R>(
  children: T[],
  resolve: (child: T) => R,
): R[] {
  //@ verify
  //@ ensures \result.length === children.length
  //@ ensures forall(i, 0 <= i && i < children.length ==> \result[i] === resolve(children[i]))
  return children.map((child) => resolve(child));
}

/** Each appended leaf gets the index of exactly the last occupied slot. */
export function appendedIndex(length: number): number {
  //@ verify
  //@ requires 0 < length && length <= 4294967295
  //@ ensures 0 <= \result && \result < length
  //@ ensures \result + 1 === length
  return length - 1;
}

/** Resolve a prepared leaf against the input-ordered results of its batch. */
export function leafValue<T>(values: readonly T[], index: number): T {
  //@ verify
  //@ requires 0 <= index && index < values.length
  //@ ensures \result === values[index]
  return values[index];
}

export type Shape = number | Shape[];

/** Project leaves to their outcomes and preserve every parent/child position. */
export function reshape<T>(shape: Shape, values: readonly T[]): unknown {
  return typeof shape === "number"
    ? leafValue(values, shape)
    : mapChildren(shape, (child) => reshape(child, values));
}

/** A shared subtree may recur after its ancestors unwind. Reject active cycles and over-depth branches. */
export function branchAllowed(onPath: boolean, depth: number): boolean {
  //@ verify
  //@ requires depth >= 0
  //@ ensures \result === (!onPath && depth <= 256)
  return !onPath && depth <= 256;
}
