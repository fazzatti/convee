/** Untargeted registrations belong to the pipe. A child requires an exact explicit target. */
export function includesRegistration(
  target: string | undefined,
  id: string,
  owner: boolean,
): boolean {
  //@ verify
  //@ ensures target === undefined ==> (\result === owner)
  //@ ensures target !== undefined ==> (\result === (target === id))
  return target === undefined ? owner : target === id;
}

/** Reusing the same child is legal; conflicting identities cannot share routing. */
export function childConflicts(
  parentId: string,
  childId: string,
  known: boolean,
  sameChild: boolean,
): boolean {
  //@ verify
  //@ ensures \result === (parentId === childId || (known && !sameChild))
  return parentId === childId || (known && !sameChild);
}
