import { pipe, plugin, step } from "./package/index.ts";
import { workerRegistry } from "./package/workers/index.ts";

export default workerRegistry({
  tasks: {
    length: () => (text: string) => text.length,
    double: () => pipe([step((n: number) => n * 2)]),
    label: () => (n: number) => `document:${n}`,
  },
  plugins: {
    add: (options: { amount: number }) =>
      plugin().onOutput((n: number) => n + options.amount),
  },
});
