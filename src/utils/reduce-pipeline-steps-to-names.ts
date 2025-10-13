import { CoreProcessType } from "../core/types.ts";

export const reducePipelineStepsToNames = <T>(steps: T[]) =>
  steps.reduce((acc: string[], s) => {
    if (
      s &&
      typeof s === "object" &&
      "type" in s &&
      s.type === CoreProcessType.PROCESS_ENGINE &&
      "name" in s &&
      typeof (s as { name: unknown }).name === "string"
    ) {
      acc.push(s.name as string);
    }
    return acc;
  }, []);

//   steps.reduce((acc: string[], s) => {
//   if (
//     s &&
//     typeof s === "object" &&
//     "type" in s &&
//     s.type === CoreProcessType.PROCESS_ENGINE &&
//     "name" in s
//   ) {
//     acc.push(s.name);
//   }
//   return acc;
// }, []);
