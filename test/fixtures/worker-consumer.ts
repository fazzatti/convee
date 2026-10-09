import { pipe, step } from "./package/index.ts";
import { parallel, workerPool } from "./package/workers/index.ts";
import type registry from "./worker-registry.ts";

const pool = workerPool.for<typeof registry>()({
  module: new URL("./worker-registry.ts", import.meta.url),
  size: 2,
  pipelines: {
    measured: {
      steps: ["length", "double"],
      plugins: [{ name: "add", options: { amount: 1 } }],
    },
  },
});
try {
  const process = parallel({
    workers: pool,
    split: (text: string) =>
      [pool.job("measured", [text]), pool.job("label", [2])] as const,
    join: ([length, label]) => ({ length, label }),
  });
  const workflow = pipe([step((text: string) => text.trim()), process]);
  const result: { length: number; label: string } = await workflow(" hello ");
  if (result.length !== 11 || result.label !== "document:2") {
    throw new Error("Isolated worker consumer returned the wrong result.");
  }
  console.log(
    "Isolated worker registry, recipe, plugin and mixed parallel Step passed.",
  );
} finally {
  await pool.close();
}
