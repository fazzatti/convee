import { ConveeError } from "./index.ts";
import { EngineMetadata } from "../core/types.ts";
import { ConveeCapable } from "../index.ts";

// Type guard to check if an error is already Convee-capable
export function isConveeCapable(error: unknown): error is ConveeCapable {
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    return (
      typeof obj.enrichConveeStack === "function" &&
      Array.isArray(obj.engineStack)
    );
  }
  return false;
}

// Utility function to make any error Convee-capable
export function makeConveeCapable<T extends Error>(
  error: T
): T & ConveeCapable {
  const conveeError = error as T & ConveeCapable;

  // Add engineStack if it doesn't exist
  if (!conveeError.engineStack) {
    conveeError.engineStack = [];
  }

  // Add enrichConveeStack method if it doesn't exist
  if (!conveeError.enrichConveeStack) {
    conveeError.enrichConveeStack = function (metadata: EngineMetadata) {
      this.engineStack.push(metadata);
      return this;
    };
  }

  return conveeError;
}

export const isError = (value: unknown): value is Error => {
  return value instanceof Error;
};
