import type {
  BaseMeta,
  ConveeErrorBuild,
  ConveeErrorContext,
  ConveeErrorDomain,
  ConveeErrorShape,
  Diagnostic,
  SerializedErrorLike,
} from "@/error/types.ts";

const CONVEE_ERROR_BRAND = Symbol.for("convee/ConveeError");

function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function toSerializableCause(cause: unknown): unknown {
  if (cause === undefined) {
    return undefined;
  }

  if (ConveeError.is(cause)) {
    return cause.toJSON();
  }

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
    } satisfies SerializedErrorLike;
  }

  return cause;
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
  readonly [CONVEE_ERROR_BRAND] = true;

  readonly domain: Domain;
  readonly code: Code;
  readonly source: string;
  readonly details?: string;
  readonly diagnostic?: Diagnostic;
  readonly meta?: Meta;
  readonly trace?: ConveeErrorShape<Code, Meta, Domain>["trace"];

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

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      domain: this.domain,
      code: this.code,
      message: this.message,
      source: this.source,
      details: this.details,
      diagnostic: this.diagnostic,
      meta: this.meta,
      trace: this.trace,
      cause: toSerializableCause(this.cause),
    };
  }

  static is(error: unknown): error is ConveeError<string, BaseMeta> {
    if (error instanceof ConveeError) {
      return true;
    }

    if (!isObjectLike(error)) {
      return false;
    }

    return (
      error[CONVEE_ERROR_BRAND] === true &&
      typeof error.message === "string" &&
      typeof error.domain === "string" &&
      typeof error.code === "string" &&
      typeof error.source === "string"
    );
  }

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

export function conveeError<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
>(
  shape: ConveeErrorShape<Code, Meta, Domain>,
): ConveeError<Code, Meta, Domain> {
  return new ConveeError(shape);
}

export function isConveeError(
  error: unknown,
): error is ConveeError<string, BaseMeta> {
  return ConveeError.is(error);
}

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

export function conveeErrorFromUnknown(
  error: unknown,
  ctx?: ConveeErrorContext<string, BaseMeta>,
): ConveeError {
  return ConveeError.fromUnknown(error, ctx);
}

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

export type DefinedConveeError<
  Code extends string,
  Meta extends BaseMeta,
  Domain extends ConveeErrorDomain,
> = ConveeError<Code, Meta, Domain> & {
  readonly code: Code;
  readonly domain: Domain;
  readonly meta: Meta;
};

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

type AnyConveeErrorCreator = ((
  args: any,
) => DefinedConveeError<string, BaseMeta, ConveeErrorDomain>) & {
  readonly code: string;
  readonly domain: ConveeErrorDomain;
  readonly source: string;
};

export type InferConveeError<TCreator> = TCreator extends {
  (...args: infer _Args): infer ErrorT;
}
  ? ErrorT
  : never;

export type InferConveeErrors<TCatalog> = {
  [K in keyof TCatalog]: InferConveeError<TCatalog[K]>;
}[keyof TCatalog];

export function createErrorFactory<
  Domain extends ConveeErrorDomain,
  Source extends string,
>(base: { domain: Domain; source: Source }) {
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
