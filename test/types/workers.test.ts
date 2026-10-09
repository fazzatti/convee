import { pipe, plugin, step } from "@convee";
import {
  parallel,
  type WorkerOutcome,
  workerPool,
} from "../../src/workers/index.ts";
import type registry from "../workers/registry.ts";

export function workerContracts(): void {
  const pool = workerPool.for<typeof registry>()({
    module: new URL("../workers/registry.ts", import.meta.url),
    size: 2,
    pipelines: {
      measure: {
        steps: ["length", "double"],
        plugins: [{ name: "add", options: { amount: 3 } }],
      },
      tagged: { steps: ["tuple", "pair"] },
      child: {
        steps: [{ task: "double", plugins: [{ name: "increment" }] }, "label"],
      },
    },
  });
  const number: Promise<number> = pool.run(pool.job("measure", ["hello"]));
  const text: Promise<string> = pool.run(pool.job("tagged", [3]));
  const process = parallel({
    workers: pool,
    split: (text: string) =>
      [pool.job("measure", [text]), pool.job("label", [1])] as const,
    join: ([number, text]) => ({
      number: number.toFixed(),
      text: text.toUpperCase(),
    }),
  }).use(plugin().onFinally(async () => {}));
  const flow = pipe([step((text: string) => text.trim()), process]);
  const result: Promise<{ number: string; text: string }> = flow("hello");
  const collect = parallel({
    workers: pool,
    mode: "collect",
    split: () => [pool.job("length", ["a"])] as const,
    join: ([result]): WorkerOutcome<number> => result,
  });
  const outcome: Promise<WorkerOutcome<number>> = collect();
  const map = parallel({
    workers: pool,
    split: (texts: string[]) => texts.map((text) => pool.job("length", [text])),
    join: (values) => values.reduce((sum, n) => sum + n, 0),
  });
  const sum: Promise<number> = map(["a"]);
  void [number, text, result, outcome, sum];
  // @ts-expect-error Unknown remote task.
  pool.job("missing", []);
  // @ts-expect-error Recipe input is inherited from its first task.
  pool.job("measure", [123]);
  // @ts-expect-error Exact argument tuple is retained.
  pool.job("pair", [123]);
  // @ts-expect-error Outer parallel Step input remains a string.
  process(123);
  // @ts-expect-error Typed successful output cannot be treated as a string.
  const wrong: Promise<string> = pool.run(pool.job("double", [1]));
  void wrong;
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    size: 1,
    // @ts-expect-error Unknown recipe child.
    pipelines: { bad: { steps: ["missing"] } },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    size: 1,
    // @ts-expect-error Numeric output cannot feed a string-input task.
    pipelines: { bad: { steps: ["double", "length"] } },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    size: 1,
    pipelines: {
      bad: {
        steps: ["double"],
        // @ts-expect-error Plugin options are inferred from its factory.
        plugins: [{ name: "add", options: { amount: "x" } }],
      },
    },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    size: 1,
    pipelines: {
      bad: {
        steps: ["label"],
        // @ts-expect-error Plugin output contract must match the whole recipe.
        plugins: [{ name: "add", options: { amount: 1 } }],
      },
    },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    size: 1,
    pipelines: {
      // @ts-expect-error Child plugin input must match that child's arguments.
      bad: { steps: [{ task: "length", plugins: [{ name: "increment" }] }] },
    },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    size: 1,
    // @ts-expect-error Recipe names must not shadow registered tasks.
    pipelines: { double: { steps: ["double"] } },
  });
  const roles = workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    roles: {
      normal: { size: 1, tasks: ["double"] },
      audit: {
        size: 1,
        plugins: { double: [{ name: "add", options: { amount: 2 } }] },
      },
    },
  });
  roles.job("double", [1], { role: "audit" });
  // @ts-expect-error Heterogeneous pools require explicit routing.
  roles.job("double", [1]);
  // @ts-expect-error Unknown role.
  roles.job("double", [1], { role: "other" });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    // @ts-expect-error Unknown role task selection.
    roles: { test: { size: 1, tasks: ["missing"] } },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    // @ts-expect-error Role plugin targets must name registered tasks or recipes.
    roles: { test: { size: 1, plugins: { missing: [{ name: "increment" }] } } },
  });
  workerPool.for<typeof registry>()({
    module: new URL(import.meta.url),
    // @ts-expect-error Role plugins must match the selected task's contract.
    roles: { test: { size: 1, plugins: { length: [{ name: "increment" }] } } },
  });
}
