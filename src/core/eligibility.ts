/** Find the earliest eligible queued item without evaluating later items. */
export function firstEligible<T>(
  items: readonly T[],
  start: number,
  eligible: (item: T) => boolean,
): number {
  //@ verify
  //@ requires 0 <= start && start <= items.length
  //@ ensures \result !== -1 ==> start <= \result
  //@ ensures -1 <= \result && \result < items.length
  //@ ensures \result >= 0 ==> eligible(items[\result])
  //@ ensures forall(k, start <= k && k < items.length && (\result === -1 || k < \result) ==> !eligible(items[k]))
  let i = start;
  while (i < items.length) {
    //@ invariant start <= i && i <= items.length
    //@ invariant forall(k, start <= k && k < i ==> !eligible(items[k]))
    //@ decreases items.length - i
    if (eligible(items[i])) return i;
    i++;
  }
  return -1;
}
