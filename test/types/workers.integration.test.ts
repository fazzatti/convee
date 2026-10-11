import { pipe, plugin, step } from "@convee";
import {
  parallel,
  persistentParallel,
  worker,
  type WorkerOutcome,
} from "@convee/workers";

export function workerContracts(): void {
  const words = worker((text: string) => text.length, {
    module: import.meta.url,
  });
  const title = worker(step((text: string, prefix: string) => prefix + text), {
    module: import.meta.url,
  });
  const pipeline = worker(
    pipe([step((n: number) => n + 1), step((n: number) => String(n))]),
    { module: import.meta.url },
  );
  const jobs = parallel({
    workers: {
      words: { worker: words, count: 3 },
      title: { worker: title, count: 4 },
    },
    split: ({ words, title }, documents: string[]) =>
      documents.map((text) =>
        [words.job(text), title.job(text, "Title: ")] as const
      ),
    join: (values) =>
      values.map(([count, title]) => ({
        count: count.toFixed(),
        title: title.toUpperCase(),
      })),
  });
  const result: Promise<{ count: string; title: string }[]> = jobs(["abc"]);
  const flow = pipe([step((text: string): [string[]] => [[text]]), jobs]);
  const composed: Promise<{ count: string; title: string }[]> = flow("abc");
  const owner = persistentParallel({
    workers: { process: { worker: pipeline, count: 1 } },
    mode: "collect",
    reopenOnUse: true,
    idleTimeoutMs: 50,
    split: ({ process }, n: number) =>
      [
        process.job(n).withContext({
          seed: { requestId: "r" },
          capture: "all",
        }),
      ] as const,
    join: ([outcome]): WorkerOutcome<string> => outcome,
  });
  const outcome: Promise<WorkerOutcome<string>> = owner.step(2);
  const hooks = plugin().onOutput((n: number) => n + 1);
  words.use(hooks);
  // @ts-expect-error Worker plugin output must match the callable.
  words.use(plugin().onOutput((value: string) => value.toUpperCase()));
  // @ts-expect-error Wrong outer input.
  jobs(12);
  // @ts-expect-error Successful output is not a number.
  const wrong: Promise<number> = jobs([]);
  parallel({
    workers: { words: { worker: words, count: 1 } },
    split: (groups, text: string) => {
      // @ts-expect-error Group names are validated and offered by IntelliSense.
      groups.missing.job(text);
      // @ts-expect-error Arguments are inferred from the worker function.
      groups.words.job(1);
      // @ts-expect-error Extra arguments are rejected.
      groups.words.job(text, "extra");
      return [groups.words.job(text)] as const;
    },
    join: ([number]) => {
      // @ts-expect-error The first job returns number, never string.
      number.toUpperCase();
      return number.toFixed();
    },
  });
  // @ts-expect-error Worker definitions require a callable, not an object registry.
  worker({ tasks: {} }, { module: import.meta.url });
  void [result, composed, outcome, wrong];
}
