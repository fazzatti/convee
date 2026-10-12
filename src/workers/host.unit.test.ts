import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { pipe, plugin, step } from "@convee";
import { worker } from "@convee/workers";
import { workerHost } from "@/workers/host.ts";
import { PROTOCOL, type Reply } from "@/workers/protocol.ts";
import { deferred } from "@test/workers/transport.ts";
const init = {
  protocol: PROTOCOL,
  kind: "init",
  module: "file:///definition.ts",
};
const run = { protocol: PROTOCOL, kind: "run", id: "1", args: [3] };
const definition = worker((n: number) => n * 2, { module: import.meta.url });
describe("Worker host protocol", () => {
  it("runs plain functions and native pipelines with worker-local hooks and fresh contexts", async () => {
    const seen: unknown[] = [];
    const body = step(function (n: number) {
      const before = this.context().state.get("count") ?? 0;
      this.context().state.set("count", Number(before) + 1);
      seen.push(before);
      if (n < 0) throw new Error("negative");
      return n * 2;
    }).use(plugin().onOutput((n: number) => n + 1));
    for (const callable of [(n: number) => n * 2 + 1, body, pipe([body])]) {
      const replies: Reply[] = [];
      const host = workerHost(
        (reply) => replies.push(reply),
        () => Promise.resolve(worker(callable, { module: import.meta.url })),
      );
      await host.receive(init);
      await host.receive({
        ...run,
        context: { seed: { count: 7 }, capture: "all" },
      });
      await host.receive(run);
      assertEquals(replies[1], {
        protocol: PROTOCOL,
        kind: "result",
        id: "1",
        ok: true,
        value: 7,
      });
      if (callable === body) {
        await host.receive({ ...run, args: [-1] });
        assertEquals(
          replies[3].kind === "result" && !replies[3].ok &&
            replies[3].error.message,
          "negative",
        );
      }
    }
    assertEquals(seen, [7, 0, 0, 7, 0]);
  });
  it("reports malformed requests and load failures, then ignores subsequent messages", async () => {
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
        () => Promise.resolve(definition),
      );
      await host.receive(value);
      await host.receive(init);
      assertEquals(replies.length, 1);
      assertEquals(replies[0].kind, "fatal");
    }
    const replies: Reply[] = [];
    await workerHost(
      (reply) => replies.push(reply),
      () => Promise.reject("load failed"),
    ).receive(init);
    assertEquals(
      replies[0].kind === "fatal" && replies[0].error.message,
      "load failed",
    );
    for (
      const value of [init, { ...run, id: 1 }, { ...run, args: null }, {
        ...run,
        context: null,
      }]
    ) {
      const replies: Reply[] = [];
      const host = workerHost(
        (reply) => replies.push(reply),
        () => Promise.resolve(definition),
      );
      await host.receive(init);
      await host.receive(value);
      assertEquals(replies[1].kind, "fatal");
    }
  });
  it("overlapping initialization and jobs cannot revive a failed host", async () => {
    const loading = deferred<unknown>();
    const replies: Reply[] = [];
    const host = workerHost(
      (reply) => replies.push(reply),
      () => loading.promise,
    );
    const pending = host.receive(init);
    await host.receive(init);
    loading.resolve(definition);
    await pending;
    assertEquals(replies.length, 1);
    const finish = deferred();
    const entered = deferred();
    const slow = worker(() => {
      entered.resolve();
      return finish.promise;
    }, { module: import.meta.url });
    const remote = workerHost(
      (reply) => replies.push(reply),
      () => Promise.resolve(slow),
    );
    await remote.receive(init);
    const active = remote.receive(run);
    await entered.promise;
    await remote.receive(run);
    finish.resolve();
    await active;
    assertEquals(replies.map((reply) => reply.kind), [
      "fatal",
      "ready",
      "fatal",
    ]);
  });
  it("projects uncloneable outputs and surfaces a broken diagnostic channel", async () => {
    const replies: Reply[] = [];
    const uncloneable = worker(() => () => 0, { module: import.meta.url });
    const host = workerHost(
      (reply) => replies.push(structuredClone(reply)),
      () => Promise.resolve(uncloneable),
    );
    await host.receive(init);
    await host.receive(run);
    assertEquals(
      replies[1].kind === "result" && !replies[1].ok && replies[1].error.code,
      "WRK_CLONE",
    );
    const broken = workerHost(() => {
      throw new Error("send failed");
    }, () => Promise.resolve(definition));
    await assertRejects(() => broken.receive(init), Error, "send failed");
  });
});
