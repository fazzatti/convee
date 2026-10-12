import {
  ConcurrencyError,
  concurrent,
  pipe,
  plugin,
  step,
} from "./package/index.ts";

const checks: string[] = [];
function check(value: unknown, name: string): asserts value {
  if (!value) throw new Error("Concurrency consumer: " + name);
  checks.push(name);
}
const workers = Reflect.get(globalThis, "__conveeWorkers") as {
  started: number;
} | undefined;
const started = workers?.started;
class Account {
  constructor(readonly id: number) {}
  signer() {
    return this.id;
  }
}
const input = new Account(7);
let active = 0, peak = 0, cleanup = 0;
const task = step(async (account: Account, signer: () => number) => {
  peak = Math.max(peak, ++active);
  await new Promise((resolve) => setTimeout(resolve, 1));
  active--;
  check(signer() === account.id, "live signer closure");
  return account;
});
task.use(
  plugin().onFinally(() => {
    cleanup++;
  }),
);
const unit = concurrent({
  concurrency: 1,
  tasks: { account: { run: task, concurrency: 1 } },
  split: ({ tasks }, account: Account) =>
    [tasks.account.job(account, () => account.signer())] as const,
  join: ([account]) => account,
});
const values = await Promise.all([unit(input), unit(input), unit(input)]);
check(peak === 1 && cleanup === 3, "shared capacity and native finalizers");
check(
  values.every((value) => value === input && value.signer() === 7),
  "class reference identity",
);
check(
  await pipe([unit, (account: Account) => account.id])(input) === 7,
  "native pipe composition",
);
const error = new RangeError("domain");
const collect = concurrent({
  tasks: {
    fail: () => {
      throw error;
    },
  },
  mode: "collect",
  split: ({ tasks }) => [tasks.fail.job()] as const,
  join: ([outcome]) => outcome,
});
const outcome = await collect();
check(
  outcome.status === "rejected" && outcome.error === error,
  "original collected error",
);

let release!: () => void, entered!: () => void, calls = 0;
const gate = new Promise<void>((resolve) => release = resolve),
  ready = new Promise<void>((resolve) => entered = resolve);
const controlled = concurrent({
  concurrency: 1,
  tasks: {
    work: async () => {
      calls++;
      entered();
      await gate;
      return calls;
    },
  },
  split: ({ tasks }) => [tasks.work.job(), tasks.work.job()] as const,
  join: (values) => values,
});
const abort = new AbortController();
let finished = false;
const canceled = controlled.runWith({ signal: abort.signal }).then(() => {
  throw new Error("Unexpected success");
}, (error) => error).finally(() => finished = true);
await ready;
abort.abort();
await Promise.resolve();
await Promise.resolve();
check(!finished && calls === 1, "abort retains actual ownership");
release();
const cancellation = await canceled;
check(
  cancellation instanceof ConcurrencyError &&
    cancellation.code === "CNC_ABORTED" && calls === 1,
  "queued work canceled without retry",
);
const foreign = Reflect.get(globalThis, "__conveeForeignSignal") as
  | (() => AbortSignal)
  | undefined;
if (foreign) {
  check(
    await unit.runWith({ signal: foreign() }, input) === input,
    "cross-realm AbortSignal",
  );
}
check(workers?.started === started, "local execution creates no workers");
Object.assign(globalThis, {
  __conveeConcurrencyReport: { passed: true, checks },
});
console.log("Convee concurrency consumer passed: " + checks.length + " checks");
