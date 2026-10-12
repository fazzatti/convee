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
 * Error carrying a stable code, domain, source, metadata and optional execution trace.
 *
 * Construct from a complete {@link ConveeErrorShape}; the native `cause` retains
 * the original failure. Metadata and trace payloads are kept by reference and are
 * not validated, redacted or deep-frozen. Use `toJSON()` for bounded diagnostics,
 * and the catalog guards when a particular metadata shape must be checked.
 *
 * @typeParam Code - Stable application or catalog error code.
 *
 * @typeParam Meta - Structured metadata associated with the code.
 * @typeParam Domain - Namespace that owns the failure.
 * @remarks Construction returns an Error instance without throwing it. Property
 * access failures in the supplied shape can still propagate from the constructor.
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

  /**
   * Initialize a structured error from the supplied diagnostic fields.
   *
   * @param shape - Required domain, code, source and message, plus optional cause,
   * metadata, details, diagnostics and execution trace. Nested values are not copied.
   *
   * @remarks Produces a new ConveeError; callers decide whether to throw or return it.
   * @throws Exceptions raised by getters or proxies on the supplied shape propagate.
   */
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

  /**
   * Project this error into bounded, cycle-safe diagnostic data.
   *
   * Nested unsupported or cyclic values are summarized by the diagnostic serializer.
   * This projection is neither a lossless transport format nor a redaction boundary.
   *
   * @returns A plain diagnostic record containing the error fields and cause projection.
   *
   * @throws Exceptions from replaced getters on this error's top-level fields propagate;
   * nested values that cannot be inspected are handled by the serializer.
   */
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

  /**
   * Check the Convee brand, native Error identity and required diagnostic members.
   *
   * @param error - Any value, typically caught from an execution.
   *
   * @returns Whether the value has the in-process Convee error shape. A true result
   * does not authenticate its origin or validate catalog-specific metadata.
   * @throws Exceptions raised by property getters or proxy traps on the value propagate.
   */
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

  /**
   * Create an unexpected-failure error with optional diagnostic overrides.
   *
   * @param args - Optional fields overriding domain `core`, source `convee`, code
   * `UNEXPECTED`, and message `Unexpected error`, with optional metadata and cause.
   *
   * @returns A new ConveeError; this helper constructs the error without throwing it.
   * @throws Exceptions raised while reading the override properties propagate.
   */
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

  /**
   * Normalize a caught value while preserving an existing ConveeError by identity.
   *
   * Native Errors contribute their message, stack and original cause; other values
   * become an unexpected error with that value as cause. Existing ConveeErrors are
   * returned unchanged, so context overrides apply only when a new error is created.
   *
   * @param error - Error or arbitrary thrown value to normalize.
   *
   * @param ctx - Optional domain, source, code, message, metadata and trace overrides.
   * @returns The original ConveeError or a new structured wrapper around the value.
   * @throws Exceptions from inspecting hostile error or context properties propagate.
   */
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

/**
 * Construct a typed ConveeError from an explicit diagnostic shape.
 *
 * @typeParam Code - Literal or application-defined error code to preserve.
 *
 * @typeParam Meta - Metadata carried by this error.
 * @typeParam Domain - Error namespace to preserve.
 * @param shape - Required identifiers and message, with optional metadata, cause
 * and trace. Nested payloads remain references supplied by the caller.
 * @returns A new structured Error without throwing or normalizing the supplied fields.
 * @throws Exceptions raised while reading the shape properties propagate.
 */
export function conveeError<
  Code extends string = string,
  Meta extends BaseMeta = BaseMeta,
  Domain extends ConveeErrorDomain = ConveeErrorDomain,
>(
  shape: ConveeErrorShape<Code, Meta, Domain>,
): ConveeError<Code, Meta, Domain> {
  return new ConveeError(shape);
}

/**
 * Check the Convee brand, native Error identity and required diagnostic members.
 *
 * @param error - Any value, typically caught from an execution.
 *
 * @returns Whether the value has the in-process Convee error shape. A true result
 * does not authenticate its origin or validate catalog-specific metadata.
 * @throws Exceptions raised by property getters or proxy traps on the value propagate.
 */
export function isConveeError(
  error: unknown,
): error is ConveeError<string, BaseMeta> {
  return ConveeError.is(error);
}

/**
 * Create an unexpected-failure error with optional diagnostic overrides.
 *
 * @param args - Optional fields overriding domain `core`, source `convee`, code
 * `UNEXPECTED`, and message `Unexpected error`, with optional metadata and cause.
 *
 * @returns A new ConveeError; this helper constructs the error without throwing it.
 * @throws Exceptions raised while reading the override properties propagate.
 */
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

/**
 * Normalize a caught value while preserving an existing ConveeError by identity.
 *
 * Native Errors contribute their message, stack and original cause; other values
 * become an unexpected error with that value as cause. Existing ConveeErrors are
 * returned unchanged, so context overrides apply only when a new error is created.
 *
 * @param error - Error or arbitrary thrown value to normalize.
 *
 * @param ctx - Optional domain, source, code, message, metadata and trace overrides.
 * @returns The original ConveeError or a new structured wrapper around the value.
 * @throws Exceptions from inspecting hostile error or context properties propagate.
 */
export function conveeErrorFromUnknown(
  error: unknown,
  ctx?: ConveeErrorContext<string, BaseMeta>,
): ConveeError {
  return ConveeError.fromUnknown(error, ctx);
}

/**
 * Match a ConveeError against a catalog creator's code, domain and source.
 *
 * @typeParam TCreator - Catalog creator whose error type should be inferred.
 *
 * @param error - Value to inspect for the Convee brand and matching identifiers.
 * @param creator - Error constructor providing the expected code, domain and source.
 * @returns Whether the identifiers match, narrowing to the creator's declared type.
 * This does not prove which function created the value or validate its metadata.
 * @throws Exceptions raised while reading either argument's properties propagate.
 */
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

/**
 * Callable catalog constructor with immutable identifying properties.
 *
 * @param args - Code-specific input passed to the catalog's build callback.
 *
 * @returns A new structured error containing the built metadata and diagnostic fields;
 * the creator returns it without throwing it.
 * @throws Exceptions from the build callback or input property access propagate.
 */
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

/**
 * Definition function obtained by binding a domain and source with createErrorFactory.
 *
 * @param definition - Stable code, fallback message and a callback mapping creator
 * arguments to metadata, optional message, cause, diagnostics and trace.
 *
 * @returns A callable creator whose immutable identifiers describe this definition.
 * @throws Exceptions raised while inspecting the definition or base properties
 * propagate. The build callback runs later, when the resulting creator is called.
 */
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

/**
 * Bind a domain and source to a family of typed error constructors.
 *
 * The returned definition function accepts a code, default message and `build`
 * callback. Its resulting creator passes its argument to `build`, constructs a
 * ConveeError and exposes immutable code/domain/source/message identifier fields.
 * It does not throw the constructed error or validate the metadata.
 *
 * @typeParam Domain - Namespace shared by this error family.
 *
 * @typeParam Source - Component identifier shared by this error family.
 * @param base - Domain and source used for every constructed error.
 * @returns A definition function that creates typed callable error constructors.
 * @remarks Binding alone does not inspect the base properties or intentionally throw.
 * Defining or invoking a creator propagates property-access and build-callback errors.
 */
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
