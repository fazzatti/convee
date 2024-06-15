import { EngineMetadata } from "../core/types.ts";

export interface IConveeError<ErrorT extends Error> extends Error {
  engineStack: EngineMetadata[];
  sourceError: ErrorT;

  enrichConveeStack: (metadata: EngineMetadata) => IConveeError<ErrorT>;
}

export interface IConveeErrorPayload<T> {
  message: string;
  error: T;
}
