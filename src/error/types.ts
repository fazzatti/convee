/** Logical namespace for a Convee error. */
export type ConveeErrorDomain =
  | "core"
  | "context"
  | "pipe"
  | "plugin"
  | "step"
  | "runtime"
  | string;

/** Free-form metadata bag attached to a Convee error. */
export type BaseMeta = Record<string, unknown>;

/** Human-oriented guidance bundled with an error. */
export interface Diagnostic {
  /** Human-readable explanation of the underlying failure. */
  rootCause: string;
  /** Suggested next action for diagnosing or correcting the failure. */
  suggestion: string;
  /** Optional links or references supporting the suggested remediation. */
  materials?: string[];
}

/** Runtime frame kind recorded in an error trace. */
export type ConveeTraceFrameKind = "pipe" | "step" | "plugin";

/** Lifecycle phase recorded for a trace frame. */
export type ConveeTracePhase = "input" | "run" | "output" | "error" | "finally";

/** Single frame in the execution trace attached to a Convee error. */
export interface ConveeTraceFrame {
  /** Runtime category associated with this trace frame. */
  kind: ConveeTraceFrameKind;
  /** Stable identity used for routing and per-identity state. */
  id: string;
  /** Lifecycle phase active when the error was captured. */
  phase?: ConveeTracePhase;
  /** Optional routing identity; an absent target applies at the enclosing runtime. */
  target?: string;
}

/** Structured execution trace captured for a failing run. */
export interface ConveeErrorTrace {
  /** Identifier shared by executions participating in this run context. */
  runId?: string;
  /** Identifier of the root run whose state this context shares. */
  rootRunId?: string;
  /** Ordered diagnostic frames associated with the failure. */
  frames: readonly ConveeTraceFrame[];
}

/** Serializable shape used to construct a `ConveeError`. */
export interface ConveeErrorShape<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
> {
  /** Logical namespace responsible for the error. */
  domain: Domain;
  /** Stable programmatic error identifier. */
  code: Code;
  /** Human-readable error message. */
  message: string;
  /** Package or component identifier that emitted the error. */
  source: string;
  /** Optional human-readable diagnostic detail. */
  details?: string;
  /** Optional root-cause guidance and remediation resources. */
  diagnostic?: Diagnostic;
  /** Original structured metadata; values are not deep-frozen or redacted. */
  meta?: Meta;
  /** Original thrown value, retained without cloning. */
  cause?: unknown;
  /** Optional execution frames identifying where the failure originated. */
  trace?: ConveeErrorTrace;
}

/** Metadata and optional diagnostics produced by an error catalog builder. */
export interface ConveeErrorBuild<Meta extends BaseMeta = BaseMeta> {
  /** Original structured metadata; values are not deep-frozen or redacted. */
  meta: Meta;
  /** Human-readable error message. */
  message?: string;
  /** Optional human-readable diagnostic detail. */
  details?: string;
  /** Optional root-cause guidance and remediation resources. */
  diagnostic?: Diagnostic;
  /** Original thrown value, retained without cloning. */
  cause?: unknown;
  /** Optional execution frames identifying where the failure originated. */
  trace?: ConveeErrorTrace;
}

/** Optional overrides accepted when normalizing unknown failures. */
export type ConveeErrorContext<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
> = Partial<Omit<ConveeErrorShape<Code, Meta, Domain>, "message">> & {
  message?: string;
};

/** Diagnostic projection shape, not a trusted deserialization format. */
export interface SerializedErrorLike {
  /** Human-readable error class name. */
  name?: string;
  /** Human-readable error message. */
  message?: string;
  /** Stable programmatic error identifier. */
  code?: string;
  /** Package or component identifier that emitted the error. */
  source?: string;
  /** Optional human-readable diagnostic detail. */
  details?: string;
  /** Optional root-cause guidance and remediation resources. */
  diagnostic?: Diagnostic;
  /** Original structured metadata; values are not deep-frozen or redacted. */
  meta?: unknown;
  /** Optional execution frames identifying where the failure originated. */
  trace?: ConveeErrorTrace;
  /** Original thrown value, retained without cloning. */
  cause?: unknown;
}
