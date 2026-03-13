import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ConveeError,
  conveeError,
  conveeErrorFromUnknown,
  createErrorFactory,
  isConveeError,
  isConveeErrorOf,
  unexpectedConveeError,
} from "@/error/index.ts";

describe("ConveeError", () => {
  describe("creation", () => {
    it("creates a structured error with native cause support", () => {
      const cause = new Error("boom");
      const error = new ConveeError({
        domain: "step",
        code: "STEP_001",
        message: "Step execution failed",
        source: "convee/step",
        details: "The step threw while processing input.",
        diagnostic: {
          rootCause: "The step implementation threw an exception.",
          suggestion: "Inspect the step body and plugin hooks.",
        },
        meta: {
          stepId: "sum-step",
        },
        cause,
        trace: {
          runId: "run-1",
          rootRunId: "run-1",
          frames: [{ kind: "step", id: "sum-step", phase: "run" }],
        },
      });

      assertEquals(error.name, "ConveeError STEP_001");
      assertEquals(error.domain, "step");
      assertEquals(error.code, "STEP_001");
      assertEquals(error.message, "Step execution failed");
      assertEquals(error.source, "convee/step");
      assertEquals(error.details, "The step threw while processing input.");
      assertEquals(
        error.diagnostic?.suggestion,
        "Inspect the step body and plugin hooks.",
      );
      assertEquals(error.meta, { stepId: "sum-step" });
      assertEquals(error.cause, cause);
      assertEquals(error.trace?.frames[0]?.id, "sum-step");
    });

    it("creates errors through the convenience factory", () => {
      const error = conveeError({
        domain: "plugin",
        code: "PLUGIN_001",
        message: "Plugin rejected input",
        source: "convee/plugin",
      });

      assertEquals(error.domain, "plugin");
      assertEquals(error.code, "PLUGIN_001");

      const exactCode: "PLUGIN_001" = error.code;

      assertEquals(exactCode, "PLUGIN_001");
    });

    it("creates typed error creators through the generic factory", () => {
      const defineRuntimeError = createErrorFactory({
        domain: "runtime",
        source: "convee/runtime",
      });
      const runtimeErrors = {
        INVALID_STATE: defineRuntimeError({
          code: "RUN_001",
          message: "Runtime entered an invalid state",
          build(args: { state: string; cause?: unknown }) {
            return {
              cause: args.cause,
              meta: {
                state: args.state,
              },
            };
          },
        }),
      } as const;

      const error = runtimeErrors.INVALID_STATE({
        state: "stopped",
        cause: "bad transition",
      });

      assertEquals(runtimeErrors.INVALID_STATE.code, "RUN_001");
      assertEquals(
        runtimeErrors.INVALID_STATE.message,
        "Runtime entered an invalid state",
      );
      assertEquals(error.domain, "runtime");
      assertEquals(error.source, "convee/runtime");
      assertEquals(error.code, "RUN_001");
      assertEquals(error.meta, { state: "stopped" });
      assertEquals(error.cause, "bad transition");
    });

    it("lets factory builders override the default message", () => {
      const defineRuntimeError = createErrorFactory({
        domain: "runtime",
        source: "convee/runtime",
      });
      const runtimeErrors = {
        INVALID_STATE: defineRuntimeError({
          code: "RUN_002",
          message: "Runtime entered an invalid state",
          build(args: { state: string }) {
            return {
              message: `Runtime state \"${args.state}\" is invalid.`,
              meta: {
                state: args.state,
              },
            };
          },
        }),
      } as const;

      const error = runtimeErrors.INVALID_STATE({ state: "paused" });

      assertEquals(error.message, 'Runtime state "paused" is invalid.');
      assertEquals(error.meta, { state: "paused" });
    });
  });

  describe("serialization", () => {
    it("serializes error data and a simplified cause", () => {
      const error = new ConveeError({
        domain: "pipe",
        code: "PIPE_001",
        message: "Pipe failed",
        source: "convee/pipe",
        cause: new Error("inner"),
      });

      assertEquals(error.toJSON(), {
        name: "ConveeError PIPE_001",
        domain: "pipe",
        code: "PIPE_001",
        message: "Pipe failed",
        source: "convee/pipe",
        details: undefined,
        diagnostic: undefined,
        meta: undefined,
        trace: undefined,
        cause: {
          name: "Error",
          message: "inner",
        },
      });
    });

    it("serializes nested Convee causes and raw values", () => {
      const nested = new ConveeError({
        domain: "plugin",
        code: "PLUGIN_002",
        message: "Nested plugin failure",
        source: "convee/plugin",
        cause: { reason: "raw" },
      });

      const error = new ConveeError({
        domain: "pipe",
        code: "PIPE_002",
        message: "Pipe failed with nested cause",
        source: "convee/pipe",
        cause: nested,
      });

      assertEquals(error.toJSON(), {
        name: "ConveeError PIPE_002",
        domain: "pipe",
        code: "PIPE_002",
        message: "Pipe failed with nested cause",
        source: "convee/pipe",
        details: undefined,
        diagnostic: undefined,
        meta: undefined,
        trace: undefined,
        cause: {
          name: "ConveeError PLUGIN_002",
          domain: "plugin",
          code: "PLUGIN_002",
          message: "Nested plugin failure",
          source: "convee/plugin",
          details: undefined,
          diagnostic: undefined,
          meta: undefined,
          trace: undefined,
          cause: { reason: "raw" },
        },
      });
    });

    it("serializes undefined cause as undefined", () => {
      const error = new ConveeError({
        domain: "core",
        code: "CORE_003",
        message: "No cause",
        source: "convee/core",
      });

      assertEquals(error.toJSON().cause, undefined);
    });
  });

  describe("guards", () => {
    it("detects Convee errors through the helper", () => {
      const error = new ConveeError({
        domain: "core",
        code: "CORE_001",
        message: "Core failure",
        source: "convee/core",
      });

      assert(ConveeError.is(error));
      assert(isConveeError(error));
      assertEquals(ConveeError.is(new Error("plain")), false);
      assertEquals(isConveeError({ message: "nope" }), false);
    });

    it("accepts branded Convee-like objects and rejects non-objects", () => {
      const branded = {
        [Symbol.for("convee/ConveeError")]: true,
        message: "Branded",
        domain: "core",
        code: "CORE_002",
        source: "convee/core",
      };

      assertEquals(ConveeError.is(branded), true);
      assertEquals(isConveeError(branded), true);
      assertEquals(ConveeError.is(null), false);
      assertEquals(ConveeError.is(123), false);
    });

    it("matches specific typed creators", () => {
      const defineRuntimeError = createErrorFactory({
        domain: "runtime",
        source: "convee/runtime",
      });
      const runtimeErrors = {
        INVALID_STATE: defineRuntimeError({
          code: "RUN_003",
          message: "Runtime entered an invalid state",
          build(args: { state: string }) {
            return {
              meta: {
                state: args.state,
              },
            };
          },
        }),
      } as const;

      const error = runtimeErrors.INVALID_STATE({ state: "stopped" });

      assertEquals(isConveeErrorOf(error, runtimeErrors.INVALID_STATE), true);
      assertEquals(
        isConveeErrorOf(
          new ConveeError({
            domain: "runtime",
            code: "RUN_999",
            message: "Other runtime error",
            source: "convee/runtime",
          }),
          runtimeErrors.INVALID_STATE,
        ),
        false,
      );
    });
  });

  describe("unexpected", () => {
    it("creates an unexpected error with sensible defaults", () => {
      const error = unexpectedConveeError({
        cause: "raw failure",
      });

      assertEquals(error.domain, "core");
      assertEquals(error.code, "UNEXPECTED");
      assertEquals(error.source, "convee");
      assertEquals(error.message, "Unexpected error");
      assertEquals(error.cause, "raw failure");
    });

    it("accepts explicit override fields", () => {
      const error = unexpectedConveeError({
        domain: "runtime",
        source: "convee/runtime",
        code: "RUN_000",
        message: "Runtime failure",
        details: "A custom failure occurred.",
        diagnostic: {
          rootCause: "The runtime entered an invalid state.",
          suggestion: "Reset the runtime state and try again.",
        },
        meta: { phase: "output" },
        trace: {
          runId: "run-9",
          frames: [{ kind: "pipe", id: "main-pipe", phase: "output" }],
        },
      });

      assertEquals(error.domain, "runtime");
      assertEquals(error.source, "convee/runtime");
      assertEquals(error.code, "RUN_000");
      assertEquals(error.message, "Runtime failure");
      assertEquals(error.details, "A custom failure occurred.");
      assertEquals(
        error.diagnostic?.rootCause,
        "The runtime entered an invalid state.",
      );
      assertEquals(error.meta, { phase: "output" });
      assertEquals(error.trace?.frames[0]?.id, "main-pipe");
    });
  });

  describe("fromUnknown", () => {
    it("returns the same instance for Convee errors", () => {
      const existing = new ConveeError({
        domain: "runtime",
        code: "RUN_001",
        message: "Existing",
        source: "convee/runtime",
      });

      assertEquals(conveeErrorFromUnknown(existing), existing);
    });

    it("wraps native errors with context", () => {
      const original = new Error("native failure");
      const wrapped = conveeErrorFromUnknown(original, {
        domain: "context",
        code: "CTX_001",
        source: "convee/context",
        details: "Step context was not active.",
        trace: {
          runId: "run-2",
          frames: [{ kind: "plugin", id: "logger", phase: "error" }],
        },
      });

      assertNotEquals(wrapped, original);
      assertEquals(wrapped.domain, "context");
      assertEquals(wrapped.code, "CTX_001");
      assertEquals(wrapped.message, "native failure");
      assertEquals(wrapped.details, "Step context was not active.");
      assertEquals(wrapped.cause, original);
      assertEquals(wrapped.trace?.frames[0]?.id, "logger");
    });

    it("wraps native errors with default fallback values", () => {
      const original = new Error("fallback failure");
      const wrapped = conveeErrorFromUnknown(original);

      assertEquals(wrapped.domain, "core");
      assertEquals(wrapped.code, "UNEXPECTED");
      assertEquals(wrapped.source, "convee");
      assertEquals(wrapped.message, "fallback failure");
      assertEquals(wrapped.cause, original);
      assertEquals(typeof wrapped.details, "string");
    });

    it("wraps non-errors as unexpected failures", () => {
      const wrapped = conveeErrorFromUnknown(42, {
        source: "convee/runtime",
        code: "RUN_999",
      });

      assertEquals(wrapped.domain, "core");
      assertEquals(wrapped.code, "RUN_999");
      assertEquals(wrapped.source, "convee/runtime");
      assertEquals(wrapped.cause, 42);
    });
  });
});
