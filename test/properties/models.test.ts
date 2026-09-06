import fc from "npm:fast-check@4.3.0";
import { assertEquals, assertRejects } from "@std/assert";
import {
  ConveeError,
  createRunContext,
  pipe,
  plugin,
  step,
} from "../../src/index.ts";

const settings = {
  seed: 20260905,
  numRuns: Deno.args.includes("--stress") ? 10000 : 1000,
};
const operation = fc.record({
  kind: fc.constantFrom("add", "multiply", "subtract"),
  value: fc.integer({ min: -4, max: 4 }),
});
type Operation = { kind: "add" | "multiply" | "subtract"; value: number };
const apply = (value: number, operation: Operation): number =>
  operation.kind === "add"
    ? value + operation.value
    : operation.kind === "multiply"
    ? value * operation.value
    : value - operation.value;

Deno.test("property: raw, wrapped, sync and async graphs agree with an independent fold", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: -100, max: 100 }),
      fc.array(operation, { minLength: 1, maxLength: 15 }),
      async (input, operations) => {
        const [head, ...tail] = operations.map((operation) => (value: number) =>
          apply(value, operation)
        );
        const expected = operations.reduce(apply, input);
        assertEquals(await pipe([head, ...tail])(input), expected);
        assertEquals(pipe.sync([head, ...tail])(input), expected);
        assertEquals(
          await pipe([
            step(head),
            ...tail.map((fn) => step(fn)),
          ])(input),
          expected,
        );
      },
    ),
    settings,
  );
});

Deno.test("property: registration command sequences match an ordered reference registry", async () => {
  const command = fc.record({
    kind: fc.constantFrom("use", "remove", "run", "temporary"),
    id: fc.integer({ min: 0, max: 4 }),
    transform: operation,
  });
  await fc.assert(
    fc.asyncProperty(
      fc.array(command, { minLength: 1, maxLength: 40 }),
      async (commands) => {
        const unit = step((value: number) => value + 1);
        let model: { id: number; transform: Operation }[] = [];
        for (const command of commands) {
          if (command.kind === "use") {
            unit.use(
              plugin.for<[number], number>()({
                output: (value) => apply(value, command.transform),
              }, { id: String(command.id) }),
            );
            model.push(command);
          } else if (command.kind === "remove") {
            unit.remove(String(command.id));
            model = model.filter((entry) => entry.id !== command.id);
          } else {
            const expected = model.reduce(
              (value, entry) => apply(value, entry.transform),
              3,
            );
            const temporary = command.kind === "temporary"
              ? [
                plugin.for<[number], number>()({
                  output: (value) => apply(value, command.transform),
                }),
              ]
              : [];
            assertEquals(
              await unit.runWith({ plugins: temporary }, 2),
              command.kind === "temporary"
                ? apply(expected, command.transform)
                : expected,
            );
            assertEquals(
              unit.plugins.map((hook) => hook.id),
              model.map((entry) => String(entry.id)),
            );
          }
        }
      },
    ),
    settings,
  );
});

Deno.test("property: arbitrary JSON values survive exact tuple transport", async () => {
  const identity = step((value: unknown) => value);
  const graph = pipe([(value: unknown) => [value] as [unknown], identity]);
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), async (value) => {
      assertEquals(await identity(value), value);
      assertEquals(await graph(value), value);
    }),
    settings,
  );
});

Deno.test("property: arbitrary thrown diagnostics serialize without a secondary exception", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.jsonValue(), fc.bigInt(), fc.constant(undefined)),
      (cause) => {
        const error = ConveeError.unexpected({ cause, meta: { cause } });
        assertEquals(typeof JSON.stringify(error), "string");
        assertEquals(error.cause, cause);
      },
    ),
    settings,
  );
});

Deno.test("property: independent concurrent invocations do not share state", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer(), { minLength: 1, maxLength: 12 }),
      async (values) => {
        const unit = step(async function (value: number) {
          this.context().state.set("value", value);
          await Promise.resolve();
          return this.context().state.get("value");
        });
        assertEquals(
          await Promise.all(values.map((value) => unit(value))),
          values,
        );
      },
    ),
    settings,
  );
});

Deno.test("property: body recovery and propagated errors agree with a result model", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(), fc.boolean(), async (value, recover) => {
      const context = createRunContext({ capture: "all" });
      const failure = new Error("model failure");
      const unit = step((_value: number): number => {
        throw failure;
      }, {
        id: "model",
        plugins: [
          plugin.for<[number], number>()({
            error: (error, inputs) => recover ? inputs[0] : error,
            output: (value) => value + 7,
          }),
        ],
      });
      if (recover) {
        assertEquals(
          await unit.runWith({ context: { parent: context } }, value),
          value + 7,
        );
      } else {assertEquals(
          await assertRejects(() =>
            unit.runWith({ context: { parent: context } }, value)
          ),
          failure,
        );}
      assertEquals(context.step.get("model")?.error, failure);
    }),
    settings,
  );
});
