import { EngineMetadata } from "../core/types.ts";

export interface IConveeError<ErrorT extends Error> extends Error {
  engineStack: EngineMetadata[];

  enrichConveeStack: (metadata: EngineMetadata) => IConveeError<ErrorT>;
}

export interface IConveeErrorPayload<T> {
  message: string;
  error: T;
}

// Interface for Convee capabilities.
// To be used to wrap external errors
export interface ConveeCapable {
  engineStack: EngineMetadata[];
  enrichConveeStack(metadata: EngineMetadata): this;
}
