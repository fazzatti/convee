export type OwnerPhase = "open" | "closing" | "dormant" | "closed";

/** Ordinary close allows reuse only for an explicitly reopenable, nonterminal owner. */
export function phaseAfterClose(
  terminal: boolean,
  reopen: boolean,
): OwnerPhase {
  //@ verify
  //@ ensures terminal ==> \result === "closed"
  //@ ensures !reopen ==> \result === "closed"
  //@ ensures !terminal && reopen ==> \result === "dormant"
  return terminal || !reopen ? "closed" : "dormant";
}

/** Closing and closed owners reject admission, even before cleanup settles. */
export function ownerAccepts(phase: OwnerPhase, terminal: boolean): boolean {
  //@ verify
  //@ ensures \result === (!terminal && (phase === "open" || phase === "dormant"))
  return !terminal && phase !== "closing" && phase !== "closed";
}

/** Release exactly one admitted invocation or reserved job after its cleanup path completes. */
export function afterRelease(active: number): number {
  //@ verify
  //@ requires 0 < active && active <= 9007199254740991
  //@ ensures 0 <= \result && \result === active - 1
  //@ ensures (\result === 0) === (active === 1)
  return active - 1;
}
