/** Only exceptions thrown by the callable guest boundary may be classified as domain errors. */
export function canClassifyGuestFailure(
  inGuestCall: boolean,
  isTrap: boolean,
): boolean {
  //@ verify
  //@ ensures \result === (inGuestCall && !isTrap)
  return inGuestCall && !isTrap;
}
