export type ConveeErrorDomain =
  | "core"
  | "context"
  | "pipe"
  | "plugin"
  | "step"
  | "runtime"
  | (string & {});

export type BaseMeta = Record<string, unknown>;

export interface Diagnostic {
  rootCause: string;
  suggestion: string;
  materials?: string[];
}

export type ConveeTraceFrameKind = "pipe" | "step" | "plugin";
export type ConveeTracePhase = "input" | "run" | "output" | "error";

export interface ConveeTraceFrame {
  kind: ConveeTraceFrameKind;
  id: string;
  phase?: ConveeTracePhase;
  target?: string;
}

export interface ConveeErrorTrace {
  runId?: string;
  rootRunId?: string;
  frames: readonly ConveeTraceFrame[];
}

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
