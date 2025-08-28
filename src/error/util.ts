import { ConveeError } from "./index.ts";

export const wrapConveeError = <ErrorT extends Error>(
  error: ErrorT
): ConveeError<ErrorT> => {
  return new ConveeError({
    message: error.message,
    error,
  });
};

export const isConveeError = <ErrorT extends Error>(
  error: ErrorT | ConveeError<ErrorT>
): error is ConveeError<ErrorT> => {
  return (error as ConveeError<ErrorT>).engineStack !== undefined;
};

export const isError = (value: unknown): value is Error => {
  return value instanceof Error;
};
