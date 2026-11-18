/** Maximum number of array or object entries inspected at a single level. */
export function diagnosticWidth(length: number): number {
  //@ verify
  //@ requires 0 <= length && length <= 4294967295
  //@ ensures 0 <= \result && \result <= 100 && \result <= length
  //@ ensures length <= 100 ==> \result === length
  //@ ensures length > 100 ==> \result === 100
  return Math.min(length, 100);
}

/** Only visit objects inside the depth limit with a remaining visit available. */
export function mayProject(remaining: number, depth: number): boolean {
  //@ verify
  //@ requires 0 <= depth
  //@ ensures \result === (depth < 8 && remaining >= 1)
  return remaining > 0 && depth < 8;
}

/** Count each object visit against the shared projection budget, including cycle checks. */
export function remainingVisits(remaining: number): number {
  //@ verify
  //@ requires 0 <= remaining
  //@ ensures \result === (remaining > 0 ? remaining - 1 : 0)
  return remaining > 0 ? remaining - 1 : 0;
}
