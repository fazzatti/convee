/** Preserve cleanup order and put the earlier execution failure first when present. */
export function orderedFailures<T>(
  execution: T | undefined,
  cleanup: T[],
): T[] {
  //@ verify
  //@ ensures execution === undefined ==> \result.length === cleanup.length
  //@ ensures execution !== undefined ==> \result.length === cleanup.length + 1
  //@ ensures execution !== undefined ==> \result[0] === execution
  //@ ensures forall(i, 0 <= i && i < cleanup.length ==> \result[i + (execution === undefined ? 0 : 1)] === cleanup[i])
  return execution === undefined ? cleanup : [execution, ...cleanup];
}
