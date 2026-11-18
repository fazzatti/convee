type Disposition = "return" | "throw-execution" | "throw-finalization";

/** Finalizer failures take precedence while preserving the earlier failure in metadata. */
export function completionDisposition(
  executionFailed: boolean,
  finalizerFailures: number,
): Disposition {
  //@ verify
  //@ requires 0 <= finalizerFailures
  //@ ensures finalizerFailures > 0 ==> \result === "throw-finalization"
  //@ ensures finalizerFailures === 0 && executionFailed ==> \result === "throw-execution"
  //@ ensures finalizerFailures === 0 && !executionFailed ==> \result === "return"
  if (finalizerFailures > 0) return "throw-finalization";
  return executionFailed ? "throw-execution" : "return";
}

type InputAction = "spread" | "wrap" | "reject";

/** Hook arrays replace the argument tuple, scalar replacements require a unary input. */
export function inputAction(isTuple: boolean, arity: number): InputAction {
  //@ verify
  //@ requires 0 <= arity
  //@ ensures isTuple ==> \result === "spread"
  //@ ensures !isTuple && arity === 1 ==> \result === "wrap"
  //@ ensures !isTuple && arity !== 1 ==> \result === "reject"
  return isTuple ? "spread" : arity === 1 ? "wrap" : "reject";
}

type WorkPhase = "input" | "run" | "error" | "output";
type NextPhase = "run" | "error" | "output" | "finally";

/** Choose the next phase after the current phase settles. Cleanup is the last phase. */
export function afterPhase(
  phase: WorkPhase,
  failed: boolean,
): NextPhase {
  //@ verify
  //@ ensures phase === "input" ==> \result === (failed ? "finally" : "run")
  //@ ensures phase === "run" ==> \result === (failed ? "error" : "output")
  //@ ensures phase === "error" ==> \result === (failed ? "finally" : "output")
  //@ ensures phase === "output" ==> \result === "finally"
  if (phase === "run") return failed ? "error" : "output";
  if (failed || phase === "output") return "finally";
  return phase === "input" ? "run" : "output";
}
