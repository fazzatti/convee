import type {
  BaseMeta,
  ConveeErrorBuild,
  ConveeErrorContext,
  ConveeErrorDomain,
  ConveeErrorShape,
  Diagnostic,
} from "@/error/types.ts";

import { diagnosticValue } from "@/error/serialize.ts";

const CONVEE_ERROR_BRAND = Symbol.for("convee/ConveeError");

function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structured Convee runtime error.
 *
 * This is intended to be a small, composable foundation for Convee errors:
 * - stable error codes
 * - consumer-facing diagnostics
 * - optional execution trace data
 * - native error chaining via `cause`
 */
export class ConveeError<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
> extends Error {
  /** In-process interoperability marker, not proof that an untrusted object is safe. */
  readonly [CONVEE_ERROR_BRAND] = true;

  /** Logical namespace responsible for the error. */
  readonly domain: Domain;
  /** Stable programmatic error identifier. */
  readonly code: Code;
  /** Package or component identifier that emitted the error. */
  readonly source: string;
  /** Optional human-readable diagnostic detail. */
  readonly details?: string;
  /** Optional root-cause guidance and remediation resources. */
  readonly diagnostic?: Diagnostic;
  /** Original structured metadata; values are not deep-frozen or redacted. */
  readonly meta?: Meta;
  /** Optional execution frames identifying where the failure originated. */
  readonly trace?: ConveeErrorShape<Code, Meta, Domain>["trace"];

  /** function Object() { [native code] } */
  constructor(shape: ConveeErrorShape<Code, Meta, Domain>) {
    super(
      shape.message,
      shape.cause === undefined ? undefined : { cause: shape.cause },
    );

    this.name = `ConveeError ${shape.code}`;
    this.domain = shape.domain;
    this.code = shape.code;
    this.source = shape.source;
    this.details = shape.details;
    this.diagnostic = shape.diagnostic;
    this.meta = shape.meta;
    this.trace = shape.trace;
  }

  /** Returns a bounded, cycle-safe diagnostic projection; this is not redaction or a lossless wire format. */
  toJSON(): Record<string, unknown> {
    return diagnosticValue({
      name: this.name,
      domain: this.domain,
      code: this.code,
      message: this.message,
      source: this.source,
      details: this.details,
      diagnostic: this.diagnostic,
      meta: this.meta,
      trace: this.trace,
      cause: this.cause,
    }) as Record<string, unknown>;
  }

  /** Checks in-process error shape and methods; does not authenticate the object or validate catalog metadata. */
  static is(error: unknown): error is ConveeError<string, BaseMeta> {
    if (!isObjectLike(error)) {
      return false;
    }

    return (
      error[CONVEE_ERROR_BRAND] === true &&
      error instanceof Error &&
      typeof error.toJSON === "function" &&
      typeof error.message === "string" &&
      typeof error.domain === "string" &&
      typeof error.code === "string" &&
      typeof error.source === "string"
    );
  }

  /** Creates a generic unexpected failure with optional diagnostic overrides. */
  static unexpected(args?: {
    domain?: ConveeErrorDomain;
    source?: string;
    code?: string;
    message?: string;
    details?: string;
    diagnostic?: Diagnostic;
    meta?: BaseMeta;
    cause?: unknown;
    trace?: ConveeErrorShape<string, BaseMeta>["trace"];
  }): ConveeError {
    return new ConveeError({
      domain: args?.domain ?? "core",
      source: args?.source ?? "convee",
      code: args?.code ?? "UNEXPECTED",
      message: args?.message ?? "Unexpected error",
      details: args?.details,
      diagnostic: args?.diagnostic,
      meta: args?.meta,
      cause: args?.cause,
      trace: args?.trace,
    });
  }

  /** Preserves existing Convee errors and wraps other failures with their original cause. */
  static fromUnknown(
    error: unknown,
    ctx?: ConveeErrorContext<string, BaseMeta>,
  ): ConveeError {
    if (ConveeError.is(error)) {
      return error;
    }

    if (error instanceof Error) {
      return new ConveeError({
        domain: ctx?.domain ?? "core",
        source: ctx?.source ?? "convee",
        code: ctx?.code ?? "UNEXPECTED",
        message: ctx?.message ?? error.message,
        details: ctx?.details ?? error.stack,
        diagnostic: ctx?.diagnostic,
        meta: ctx?.meta,
        cause: error,
        trace: ctx?.trace,
      });
    }

    return ConveeError.unexpected({
      domain: ctx?.domain,
      source: ctx?.source,
      code: ctx?.code,
      message: ctx?.message,
      details: ctx?.details,
      diagnostic: ctx?.diagnostic,
      meta: ctx?.meta,
      cause: error,
      trace: ctx?.trace,
    });
  }
}

/** Creates a `ConveeError` instance from a fully defined error shape. */
export function conveeError<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
>(
  shape: ConveeErrorShape<Code, Meta, Domain>,
): ConveeError<Code, Meta, Domain> {
  return new ConveeError(shape);
}

/** Returns `true` when the provided value is a Convee error instance. */
export function isConveeError(
  error: unknown,
): error is ConveeError<string, BaseMeta> {
  return ConveeError.is(error);
}

/** Creates a fallback unexpected Convee error with optional overrides. */
export function unexpectedConveeError(args?: {
  domain?: ConveeErrorDomain;
  source?: string;
  code?: string;
  message?: string;
  details?: string;
  diagnostic?: Diagnostic;
  meta?: BaseMeta;
  cause?: unknown;
  trace?: ConveeErrorShape<string, BaseMeta>["trace"];
}): ConveeError {
  return ConveeError.unexpected(args);
}

/** Wraps an unknown thrown value in a normalized `ConveeError`. */
export function conveeErrorFromUnknown(
  error: unknown,
  ctx?: ConveeErrorContext<string, BaseMeta>,
): ConveeError {
  return ConveeError.fromUnknown(error, ctx);
}

/** Narrows a Convee error to the creator that produced it. */
export function isConveeErrorOf<TCreator extends AnyConveeErrorCreator>(
  error: unknown,
  creator: TCreator,
): error is InferConveeError<TCreator> {
  return (
    ConveeError.is(error) &&
    error.code === creator.code &&
    error.domain === creator.domain &&
    error.source === creator.source
  );
}

/** Error instance with a literal message and source from its catalog definition. */
export type DefinedConveeError<
  Code extends string,
  Meta extends BaseMeta,
  Domain extends ConveeErrorDomain,
> = ConveeError<Code, Meta, Domain> & {
  readonly code: Code;
  readonly domain: Domain;
  readonly meta: Meta;
};

/** Callable error constructor with immutable code, source and domain identifiers. */
export type ConveeErrorCreator<
  Code extends string,
  Meta extends BaseMeta,
  Domain extends ConveeErrorDomain,
  Source extends string,
  Message extends string,
  Args,
> = ((args: Args) => DefinedConveeError<Code, Meta, Domain>) & {
  readonly code: Code;
  readonly domain: Domain;
  readonly source: Source;
  readonly message: Message;
};

/** Structural constructor signature accepted by catalog inference helpers. */
export type AnyConveeErrorCreator =
  & ((
    args: never,
  ) => DefinedConveeError<string, BaseMeta, ConveeErrorDomain>)
  & {
    readonly code: string;
    readonly domain: ConveeErrorDomain;
    readonly source: string;
  };

/** Infers the error instance produced by one catalog constructor. */
export type InferConveeError<TCreator> = TCreator extends {
  (...args: infer _Args): infer ErrorT;
} ? ErrorT
  : never;

/** Produces the discriminated union of errors in a catalog. */
export type InferConveeErrors<TCatalog> = {
  [K in keyof TCatalog]: InferConveeError<TCatalog[K]>;
}[keyof TCatalog];

/** Typed definition function returned by createErrorFactory. */
export type ErrorFactory<
  Domain extends ConveeErrorDomain,
  Source extends string,
> = <Code extends string, Message extends string, Meta extends BaseMeta, Args>(
  definition: {
    code: Code;
    message: Message;
    build(args: Args): ConveeErrorBuild<Meta>;
  },
) => ConveeErrorCreator<Code, Meta, Domain, Source, Message, Args>;

/** Bind a domain and source to a family of typed error creators. */
export function createErrorFactory<
  Domain extends ConveeErrorDomain,
  Source extends string,
>(base: { domain: Domain; source: Source }): ErrorFactory<Domain, Source> {
  return function defineError<
    Code extends string,
    Message extends string,
    Meta extends BaseMeta,
    Args,
  >(definition: {
    code: Code;
    message: Message;
    build(args: Args): ConveeErrorBuild<Meta>;
  }): ConveeErrorCreator<Code, Meta, Domain, Source, Message, Args> {
    const creator = ((args: Args) => {
      const built = definition.build(args);

      return new ConveeError({
        domain: base.domain,
        source: base.source,
        code: definition.code,
        message: built.message ?? definition.message,
        details: built.details,
        diagnostic: built.diagnostic,
        meta: built.meta,
        cause: built.cause,
        trace: built.trace,
      }) as DefinedConveeError<Code, Meta, Domain>;
    }) as ConveeErrorCreator<Code, Meta, Domain, Source, Message, Args>;

    Object.defineProperties(creator, {
      code: {
        value: definition.code,
        enumerable: true,
      },
      domain: {
        value: base.domain,
        enumerable: true,
      },
      source: {
        value: base.source,
        enumerable: true,
      },
      message: {
        value: definition.message,
        enumerable: true,
      },
    });

    return creator;
  };
}

export type * from "@/error/types.ts";
