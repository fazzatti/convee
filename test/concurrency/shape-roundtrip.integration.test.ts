import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ConcurrencyError,
  concurrent,
  type ConcurrentJob,
  type ConcurrentJobTree,
} from "@convee";

describe("Split/join path correspondence", () => {
  it("associates repeated descriptors with their occurrence when all jobs settle in reverse order", async () => {
    for (const mode of ["all", "collect"] as const) {
      const entered = Promise.withResolvers<void>();
      const jobs = Array.from(
        { length: 4 },
        () => Promise.withResolvers<number>(),
      );
      const errors = [new Error("first"), new Error("last")];
      let count = 0, joins = 0;
      const unit = concurrent({
        mode,
        tasks: {
          task: () => {
            const slot = count++;
            if (count === jobs.length) entered.resolve();
            return jobs[slot].promise;
          },
        },
        split: ({ task }) => {
          const repeated = task.job();
          return [[], [repeated, [task.job(), repeated]], task.job()] as const;
        },
        join: (tree) => {
          joins++;
          return tree;
        },
      });
      const pending = unit();
      await entered.promise;
      jobs[3].reject(errors[1]);
      jobs[2].resolve(12);
      jobs[1].resolve(11);
      jobs[0].reject(errors[0]);
      if (mode === "all") {
        const failure = await assertRejects(() => pending, ConcurrencyError);
        const causes = (failure.cause as AggregateError).errors;
        assertEquals(causes.length, 2);
        causes.forEach((e, i) => assertStrictEquals(e, errors[i]));
        assertEquals(joins, 0);
      } else {
        assertEquals(await pending, [[], [{
          status: "rejected",
          error: errors[0],
        }, [{ status: "fulfilled", value: 11 }, {
          status: "fulfilled",
          value: 12,
        }]], { status: "rejected", error: errors[1] }]);
        assertEquals(joins, 1);
      }
    }
  });

  it("accepts depth 256, rejects the next level before any job, and rejects inherited hole contents", async () => {
    let starts = 0;
    const unit = concurrent({
      tasks: { task: () => ++starts },
      split: ({ task }, depth: number): ConcurrentJobTree => {
        const leaf = task.job();
        if (depth < 0) {
          const sparse = new Array<ConcurrentJob>(1);
          Object.setPrototypeOf(sparse, [leaf]);
          return [leaf, sparse];
        }
        let shape: ConcurrentJobTree = [leaf];
        for (let i = 0; i < depth; i++) shape = [shape];
        return shape;
      },
      join: () => 42,
    });
    assertEquals(await unit(256), 42);
    for (const invalid of [257, -1]) {
      const error = await assertRejects(() => unit(invalid), ConcurrencyError);
      assertEquals(error.code, "CNC_CONFIG");
    }
    assertEquals(starts, 1);
  });
});
