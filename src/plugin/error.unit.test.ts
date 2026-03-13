import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  PLG_ERRORS,
  isPluginError,
  type PluginErrorOf,
} from "@/plugin/index.ts";
import { ConveeError } from "@/error/index.ts";

describe("PluginError", () => {
  it("creates unknown thrown plugin errors", () => {
    const error = PLG_ERRORS.UNKNOWN_THROWN({
      cause: { reason: "boom" },
      pluginId: "logger",
      target: "sum-step",
    });

    assertEquals(error.domain, "plugin");
    assertEquals(error.source, "convee/plugin");
    assertEquals(error.code, PLG_ERRORS.UNKNOWN_THROWN.code);
    assertEquals(error.message, "Unknown plugin error");
    assertEquals(error.meta, {
      pluginId: "logger",
      target: "sum-step",
    });
  });

  it("creates unknown thrown plugin errors without target metadata", () => {
    const error = PLG_ERRORS.UNKNOWN_THROWN({
      cause: { reason: "boom" },
      pluginId: "logger",
    });

    assertEquals(error.meta, {
      pluginId: "logger",
    });
  });

  it("creates invalid definition plugin errors", () => {
    const error = PLG_ERRORS.INVALID_DEFINITION({
      capability: "output",
      pluginId: "logger",
      received: 42,
    });

    assertEquals(error.code, PLG_ERRORS.INVALID_DEFINITION.code);
    assertEquals(
      error.message,
      'Plugin definition is invalid for capability "output".',
    );
    assertEquals(error.meta, {
      capability: "output",
      received: 42,
      pluginId: "logger",
    });
  });

  it("creates invalid definition plugin errors with minimal metadata", () => {
    const error = PLG_ERRORS.INVALID_DEFINITION({
      capability: "input",
      target: "sum-step",
    });

    assertEquals(error.meta, {
      capability: "input",
      target: "sum-step",
    });
  });

  it("narrows meta by code", () => {
    if (false) {
      const error = null as unknown as PluginErrorOf<
        typeof PLG_ERRORS.INVALID_DEFINITION.code
      >;

      const capability: string = error.meta.capability;
      const received: unknown = error.meta.received;

      void capability;
      void received;
    }
  });

  it("detects plugin errors through the module guard", () => {
    assertEquals(
      isPluginError(
        PLG_ERRORS.UNKNOWN_THROWN({
          cause: { reason: "boom" },
          pluginId: "logger",
        }),
      ),
      true,
    );
    assertEquals(
      isPluginError(
        new ConveeError({
          domain: "step",
          code: "STP_999",
          message: "Not a plugin error",
          source: "convee/step",
        }),
      ),
      false,
    );
  });
});
