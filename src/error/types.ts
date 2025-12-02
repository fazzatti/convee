import { EngineMetadata } from "../core/types.ts";

/**
 * Interface for ConveeError that extends the standard Error.
 * @template ErrorT - The original error type
 */
export interface IConveeError<ErrorT extends Error> extends Error {
  /** Stack of metadata from processes this error has passed through */
  engineStack: EngineMetadata[];
  /** Method to add process metadata to the error stack */
  enrichConveeStack: (metadata: EngineMetadata) => IConveeError<ErrorT>;
}

/**
 * Payload for creating a ConveeError.
 * @template T - The original error type
 */
export interface IConveeErrorPayload<T> {
  /** The error message */
  message: string;
  /** The original error being wrapped */
  error: T;
}

/**
 * Interface for making any error Convee-capable.
 * Used to wrap external errors with Convee tracking capabilities.
 */
export interface ConveeCapable {
  /** Stack of metadata from processes this error has passed through */
  engineStack: EngineMetadata[];
  /** Method to add process metadata to the error stack */
  enrichConveeStack(metadata: EngineMetadata): this;
}

/**
 * Parsed metadata stored in the error's engine stack.
 * A simplified view of EngineMetadata for error tracking.
 */
export type ParsedMetadata = {
  /** The source identifier (process ID) */
  source: string;
  /** The type of process (PROCESS_ENGINE or PIPELINE) */
  type: string;
  /** Unique identifier for the item being processed */
  itemId: string;
  /** Keys of metadata that were collected at time of error */
  dataKeys?: string[];
};
