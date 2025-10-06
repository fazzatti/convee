import { ProcessEngine } from "../../process-engine/types.ts";

export const isProcessEngine = <I, O, E extends Error>(
  value: unknown
): value is ProcessEngine<I, O, E> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "run" in value &&
    typeof value.run === "function"
  );
};
