import { ConveeError, plugin, step } from "@convee";
import { worker } from "@convee/workers";
let counter = 0;
const instance = crypto.randomUUID();
export interface Input {
  readonly operation:
    | "value"
    | "state"
    | "error"
    | "clone"
    | "timeout"
    | "crash"
    | "context"
    | "cpu";
  readonly value?: number;
}
export default worker(
  step(
    async function (
      input: Input,
    ): Promise<{ value: number; instance: string; counter: number }> {
      counter++;
      if (input.operation === "error") {
        throw new ConveeError({
          domain: "document",
          source: "consumer",
          code: "DOCUMENT_EMPTY",
          message: "No document",
          meta: { bounded: () => 1 },
          cause: new Error("empty"),
        });
      }
      if (input.operation === "clone") {
        return {
          value: 0,
          instance,
          counter,
          uncloneable: () => 0,
        } as never;
      }
      if (input.operation === "crash") {
        setTimeout(() => {
          throw new Error("worker crash");
        }, 0);
        return await new Promise(() => {});
      }
      if (input.operation === "timeout") return await new Promise(() => {});
      let value = input.value ?? 0;
      if (input.operation === "context") {
        value = Number(this.context().state.get("count") ?? 0);
        this.context().state.set("count", value + 1);
      }
      if (input.operation === "cpu") {
        for (let n = 0; n < 1000000; n++) value = (value + n) % 123457;
      }
      return { value, instance, counter };
    },
  ).use(
    plugin().onOutput((
      value: { value: number; instance: string; counter: number },
    ) => ({ ...value, value: value.value + 1 })),
  ),
  { module: import.meta.url },
);
