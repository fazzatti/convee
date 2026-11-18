interface JobId {
  readonly id: string;
}

/** Reject unsolicited, stale, and cross-job replies before settling any job. */
export function replyBelongs(
  ready: boolean,
  active: JobId | undefined,
  reply: JobId,
): boolean {
  //@ verify
  //@ ensures !ready || active === undefined ==> !\result
  //@ ensures ready && active !== undefined ==> (\result === (active.id === reply.id))
  if (active === undefined) return false;
  return ready && active.id === reply.id;
}

export type HostPhase = "empty" | "loading" | "ready" | "busy" | "failed";
type RequestKind = "init" | "run";

/** Gate requests against host state before inspecting their payload or invoking user code. */
export function acceptsRequest(phase: HostPhase, kind: RequestKind): boolean {
  //@ verify
  //@ ensures kind === "init" ==> (\result === (phase === "empty"))
  //@ ensures kind === "run" ==> (\result === (phase === "ready"))
  return kind === "init" ? phase === "empty" : phase === "ready";
}

/** A protocol failure during an await is absorbing; late completions cannot revive the host. */
export function afterHostWork(phase: HostPhase): HostPhase {
  //@ verify
  //@ ensures phase === "failed" ==> \result === "failed"
  //@ ensures phase !== "failed" ==> \result === "ready"
  return phase === "failed" ? "failed" : "ready";
}

/** A slot takes a queued job only after readiness and before transport retirement. */
export function mayDispatch(
  dead: boolean,
  ready: boolean,
  busy: boolean,
  queued: number,
): boolean {
  //@ verify
  //@ requires 0 <= queued
  //@ ensures \result === (!dead && ready && !busy && queued > 0)
  return !dead && ready && !busy && queued > 0;
}
