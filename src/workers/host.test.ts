import { assertEquals, assertRejects } from "@std/assert";
import { workerHost } from "./host.ts";
import { PROTOCOL, type Reply } from "./protocol.ts";
import { workerRegistry } from "./registry.ts";
import registry from "../../test/workers/registry.ts";

const init = {
  protocol: PROTOCOL,
  kind: "init",
  module: "file:///registry.ts",
  pipelines: {},
  role: { name: "default", size: 1, plugins: {} },
};
const run = {
  protocol: PROTOCOL,
  kind: "run",
  id: "1",
  task: "double",
  args: [3],
};

Deno.test("worker host executes jobs with fresh context and reports ordinary errors", async () => {
  const replies: Reply[] = [];
  const host = workerHost(
    (value) => replies.push(value),
    () => Promise.resolve(registry),
  );
  await host.receive(init);
  await host.receive(run);
  await host.receive({ ...run, task: "missing" });
  await host.receive({
    ...run,
    task: "count",
    args: [],
    context: { seed: { count: 4 }, capture: "all" },
  });
  await host.receive({ ...run, task: "count", args: [] });
  assertEquals(replies[1], {
    protocol: PROTOCOL,
    kind: "result",
    id: "1",
    ok: true,
    value: 6,
  });
  assertEquals(
    replies[2].kind === "result" && !replies[2].ok && replies[2].error.code,
    "WRK_CONFIG",
  );
  assertEquals(
    replies[3].kind === "result" && replies[3].ok && replies[3].value,
    5,
  );
  assertEquals(
    replies[4].kind === "result" && replies[4].ok && replies[4].value,
    1,
  );
});

Deno.test("worker host reports module failures and stops accepting malformed messages", async () => {
  for (
    const value of [
      null,
      { protocol: "other" },
      { protocol: PROTOCOL, kind: "unknown" },
      run,
      { ...init, module: 1 },
    ]
  ) {
    const replies: Reply[] = [];
    const host = workerHost(
      (reply) => replies.push(reply),
      () => Promise.resolve(registry),
    );
    await host.receive(value);
    await host.receive(init);
    assertEquals(replies.length, 1);
    assertEquals(replies[0].kind, "fatal");
  }
  const replies: Reply[] = [];
  const failed = workerHost(
    (reply) => replies.push(reply),
    () => Promise.reject("load failed"),
  );
  await failed.receive(init);
  assertEquals(
    replies[0].kind === "fatal" && replies[0].error.message,
    "load failed",
  );
});

Deno.test("worker host forbids duplicate initialization and malformed jobs", async () => {
  for (
    const value of [init, { ...run, id: 1 }, { ...run, task: 1 }, {
      ...run,
      args: 1,
    }, { ...run, context: null }]
  ) {
    const replies: Reply[] = [];
    const host = workerHost(
      (reply) => replies.push(reply),
      () => Promise.resolve(registry),
    );
    await host.receive(init);
    await host.receive(value);
    assertEquals(replies[1].kind, "fatal");
  }
});

Deno.test("overlapping initialization or jobs cannot revive a failed worker host", async () => {
  let load!: (value: typeof registry) => void;
  const replies: Reply[] = [];
  const host = workerHost(
    (reply) => replies.push(reply),
    () =>
      new Promise((resolve) => {
        load = resolve;
      }),
  );
  const pending = host.receive(init);
  await host.receive(init);
  load(registry);
  await pending;
  assertEquals(replies.length, 1);
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const slow = workerRegistry({
    tasks: {
      slow: () => () =>
        new Promise<void>((resolve) => {
          finish = resolve;
          entered();
        }),
    },
  });
  const worker = workerHost(
    (reply) => replies.push(reply),
    () => Promise.resolve(slow),
  );
  await worker.receive(init);
  const job = worker.receive({ ...run, task: "slow", args: [] });
  // A broken runtime can finish before entering the body; do not spin forever.
  await Promise.race([started, job]);
  assertEquals(typeof finish, "function");
  await worker.receive(run);
  finish();
  await job;
  assertEquals(replies.map((reply) => reply.kind), ["fatal", "ready", "fatal"]);
});

Deno.test("result clone failures are transported as errors and broken sends surface", async () => {
  const replies: Reply[] = [];
  const host = workerHost(
    (reply) => replies.push(structuredClone(reply)),
    () => Promise.resolve(registry),
  );
  await host.receive(init);
  await host.receive({ ...run, task: "unclonable", args: [] });
  assertEquals(
    replies[1].kind === "result" && !replies[1].ok && replies[1].error.code,
    "WRK_CLONE",
  );
  let calls = 0;
  const transport = workerHost((reply) => {
    if (++calls === 1) throw new Error("send failed");
    replies.push(reply);
  }, () => Promise.resolve(registry));
  await transport.receive(init);
  assertEquals(replies[2].kind, "fatal");
  const broken = workerHost(() => {
    throw new Error("disconnected");
  }, () => Promise.resolve(registry));
  await assertRejects(() => broken.receive(init), Error, "disconnected");
});
