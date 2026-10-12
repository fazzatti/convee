import { ConveeError, pipe, plugin, step } from "./package/index.ts";
import { worker } from "./package/workers/index.ts";

let counter = 0;
const instance = crypto.randomUUID();
export interface Request {
  operation?: "crash" | "timeout" | "error" | "clone" | "context";
  value: number;
}
export interface Result {
  value: number;
  instance: string;
  counter: number;
}
const body = step(async function (input: Request): Promise<Result> {
  counter++;
  if (input.operation === "crash") {
    setTimeout(() => {
      throw new Error("intentional consumer crash");
    }, 0);
    return await new Promise(() => {});
  }
  if (input.operation === "timeout") return await new Promise(() => {});
  if (input.operation === "error") {
    throw new ConveeError({
      domain: "consumer",
      source: "fixture",
      code: "EMPTY",
      message: "empty",
      meta: { fn: () => 1 },
      cause: new Error("root"),
    });
  }
  const value = input.operation === "context"
    ? Number(this.context().state.get("seed") ?? 0)
    : input.value;
  this.context().state.set("seed", 999);
  return {
    value,
    instance,
    counter,
    ...(input.operation === "clone" ? { fn: () => 1 } : {}),
  };
});
export default worker(
  pipe([body]).use(
    plugin().onOutput((output: Result) => ({
      ...output,
      value: output.value + 1,
    })),
  ),
  { module: import.meta.url },
);
