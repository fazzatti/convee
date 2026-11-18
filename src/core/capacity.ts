/** Admit a whole batch exactly when the resulting occupancy is within capacity. */
export function fitsCapacity(
  used: number,
  requested: number,
  limit: number,
): boolean {
  //@ verify
  //@ requires 0 <= used && used <= limit && limit <= 9007199254740991
  //@ requires 0 <= requested && requested <= 9007199254740991
  //@ ensures \result === (used + requested <= limit)
  //@ ensures \result ==> 0 <= used + requested && used + requested <= 9007199254740991
  return requested <= limit - used;
}

/** Return post-admission occupancy, or reject the complete batch before charging it. */
export function admittedOccupancy(
  used: number,
  requested: number,
  limit: number,
): number {
  //@ verify
  //@ requires 0 <= used && used <= limit && limit <= 9007199254740991
  //@ requires 0 <= requested && requested <= 9007199254740991
  //@ ensures (\result === -1) === (used + requested > limit)
  //@ ensures \result !== -1 ==> \result === used + requested && used <= \result && \result <= limit
  if (!fitsCapacity(used, requested, limit)) return -1;
  return used + requested;
}

/** Reserve the next replacement number, or keep an exhausted budget unchanged. */
export function nextRestart(used: number, limit: number): number {
  //@ verify
  //@ requires 0 <= used && used <= limit && limit <= 9007199254740991
  //@ ensures used <= \result && \result <= limit
  //@ ensures used < limit ==> \result === used + 1
  //@ ensures used === limit ==> \result === used
  return used < limit ? used + 1 : used;
}
