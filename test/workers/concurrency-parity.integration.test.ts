import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { concurrent, pipe } from "@convee";
import { parallel } from "@convee/workers";
import definition, { type Input } from "@test/workers/registry.ts";

describe("Local and worker composition contracts", () => {
  it("uses direct job builders, ordered joins and aggregate errors through both executors", async () => {
    const local = concurrent({
      tasks: {
        operation: (input: Input) => {
          if (input.operation === "error") throw new Error("No document");
          return { value: (input.value ?? 0) + 1 };
        },
      },
      split: ({ operation }, inputs: Input[]) =>
        inputs.map((input) => operation.job(input)),
      join: (values) => ({ values: values.map((value) => value.value) }),
    });
    const remote = parallel({
      workers: { operation: { worker: definition, count: 2 } },
      split: ({ operation }, inputs: Input[]) =>
        inputs.map((input) => operation.job(input)),
      join: (values) => ({ values: values.map((value) => value.value) }),
    });
    for (const unit of [local, remote]) {
      const flow = pipe([
        unit,
        ({ values }: { values: number[] }) => values.join(","),
      ]);
      assertEquals(
        await flow([{ operation: "value", value: 2 }, {
          operation: "value",
          value: 5,
        }]),
        "3,6",
      );
      const error = await unit([
        { operation: "error" },
        { operation: "value" },
        { operation: "error" },
      ]).catch((error) => error);
      assert(error instanceof Error);
      assert(error.cause instanceof AggregateError);
      assertEquals(error.cause.errors.length, 2);
      assertEquals(Reflect.get(error, "meta").failures, error.cause.errors);
    }
  });
});
