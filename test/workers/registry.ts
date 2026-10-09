import { pipe, plugin, step } from "../../src/index.ts";
import { workerRegistry } from "../../src/workers/index.ts";

export default workerRegistry({
  tasks: {
    length: () => (text: string) => text.length,
    double: () => step((n: number) => n * 2),
    label: () => pipe([(n: number) => `value:${n}`]),
    tuple: () => (n: number) => [n, "ok"] as [number, string],
    pair: () => (n: number, tag: string) => `${tag}:${n}`,
    fail: () => () => {
      throw new Error("job failed");
    },
    unclonable: () => () => () => 1,
    count: () =>
      step(function () {
        const count = Number(this.context().state.get("count") ?? 0) + 1;
        this.context().state.set("count", count);
        return count;
      }),
    finalized: () =>
      step(() => ({ done: false })).use(
        plugin()
          .onOutput(function (value: { done: boolean }) {
            this.context().state.set("value", value);
            return value;
          })
          .onFinally(async function () {
            await Promise.resolve();
            (this.context().state.get("value") as { done: boolean }).done =
              true;
          }),
      ),
    barrier: () => (buffer: SharedArrayBuffer, label: string) => {
      const values = new Int32Array(buffer);
      Atomics.add(values, 0, 1);
      Atomics.notify(values, 0);
      while (Atomics.load(values, 0) < 2) {
        if (Atomics.wait(values, 0, 1, 5000) === "timed-out") {
          throw new Error(
            "Jobs did not execute concurrently in separate workers.",
          );
        }
      }
      return label;
    },
  },
  plugins: {
    add: (options: { amount: number }) =>
      plugin().onOutput((n: number) => n + options.amount),
    prefix: (options: { text: string }) =>
      plugin().onOutput((text: string) => options.text + text),
    increment: () => plugin().onInput((n: number) => n + 1),
  },
});
