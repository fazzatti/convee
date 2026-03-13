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
  rootCause: string;
  suggestion: string;
  materials?: string[];
}

/** Runtime frame kind recorded in an error trace. */
export type ConveeTraceFrameKind = "pipe" | "step" | "plugin";

/** Lifecycle phase recorded for a trace frame. */
export type ConveeTracePhase = "input" | "run" | "output" | "error";

/** Single frame in the execution trace attached to a Convee error. */
export interface ConveeTraceFrame {
  kind: ConveeTraceFrameKind;
  id: string;
  phase?: ConveeTracePhase;
  target?: string;
}

/** Structured execution trace captured for a failing run. */
export interface ConveeErrorTrace {
  runId?: string;
  rootRunId?: string;
  frames: readonly ConveeTraceFrame[];
}

/** Serializable shape used to construct a `ConveeError`. */
export interface ConveeErrorShape<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
> {
  domain: Domain;
  code: Code;
  message: string;
  source: string;
  details?: string;
  diagnostic?: Diagnostic;
  meta?: Meta;
  cause?: unknown;
  trace?: ConveeErrorTrace;
}

export interface ConveeErrorBuild<Meta extends BaseMeta = BaseMeta> {
  meta: Meta;
  message?: string;
  details?: string;
  diagnostic?: Diagnostic;
  cause?: unknown;
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

export interface SerializedErrorLike {
  name?: string;
  message?: string;
  code?: string;
  source?: string;
  details?: string;
  diagnostic?: Diagnostic;
  meta?: unknown;
  trace?: ConveeErrorTrace;
  cause?: unknown;
}
