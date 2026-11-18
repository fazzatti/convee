/** Persistent registrations precede per-run registrations, including duplicates. */
export function registrationsForRun<T>(
  persistent: readonly T[],
  temporary: readonly T[],
): T[] {
  //@ verify
  //@ ensures \result.length === persistent.length + temporary.length
  //@ ensures forall(i, 0 <= i && i < persistent.length ==> \result[i] === persistent[i])
  //@ ensures forall(i, 0 <= i && i < temporary.length ==> \result[persistent.length + i] === temporary[i])
  return [...persistent, ...temporary];
}

/** Transport a vector of arguments in the same order, retaining its element values. */
export function copyArguments<T>(values: readonly T[]): T[] {
  //@ verify
  //@ ensures \result.length === values.length
  //@ ensures forall(i, 0 <= i && i < values.length ==> \result[i] === values[i])
  return [...values];
}

/** A scalar output becomes a single argument, including an undefined output. */
export function singleArgument<T>(value: T): T[] {
  //@ verify
  //@ ensures \result.length === 1
  //@ ensures \result[0] === value
  return [value];
}
