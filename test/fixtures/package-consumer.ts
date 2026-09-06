import {
  ConveeError,
  createRunContext,
  pipe,
  plugin,
  step,
} from "./package/index.ts";

const numbers = step(
  (values: number[]) => values.reduce((total, value) => total + value, 0),
  { id: "sum" },
);
const graph = pipe([numbers, (value: number) => String(value)], {
  id: "graph",
});
const context = createRunContext({ capture: "none" });
const result: string = await graph.runWith({ context: { parent: context } }, [
  2,
  3,
]);
if (result !== "5" || context.step.previous()?.input !== undefined) {
  throw new Error("Package runtime mismatch");
}
const sync = step.sync((value: number) => value, {
  plugins: [plugin.sync().onOutput((value: number) => value + 2)],
});
const total: number = sync(2);
if (total !== 4 || typeof graph.bind(null) !== "function") {
  throw new Error("Package sync/callable mismatch");
}
const diagnostic = JSON.parse(
  JSON.stringify(ConveeError.unexpected({ cause: 1n })),
);
if (diagnostic.cause !== "1n") throw new Error("Package diagnostic mismatch");
