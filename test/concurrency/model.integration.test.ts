import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { concurrent, plugin, step } from "@convee";

describe("Concurrent scheduling model", () => {
  it("preserves every result and lifecycle across 192 queued jobs and 64 overlapping runs", async () => {
    let active = 0, peak = 0, finalized = 0;
    const byGroup = [0, 0], peaks = [0, 0], seen = new Set<number>();
    const make = (group: number) => {
      const unit = step(async (id: number) => {
        assert(!seen.has(id));
        seen.add(id);
        peak = Math.max(peak, ++active);
        peaks[group] = Math.max(peaks[group], ++byGroup[group]);
        for (let turn = 0; turn < (id % 5) + 1; turn++) await Promise.resolve();
        active--;
        byGroup[group]--;
        if (id % 11 === 0) throw new RangeError(`failed:${id}`);
        return id * 2;
      });
      unit.use(
        plugin().onFinally(async () => {
          await Promise.resolve();
          finalized++;
        }),
      );
      return unit;
    };
    const unit = concurrent({
      capacityScope: "shared",
      concurrency: 3,
      maxPending: 256,
      mode: "collect",
      tasks: {
        a: { run: make(0), concurrency: 1 },
        b: { run: make(1), concurrency: 2 },
      },
      split: (tasks, batch: number) =>
        [0, 1, 2].map((offset) => {
          const id = batch * 3 + offset;
          return (id % 2 ? tasks.a : tasks.b).job(id);
        }),
      join: (results) => results,
    });
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, n) => unit(n)),
    );
    assertEquals(seen.size, 192);
    assertEquals(finalized, 192);
    assertEquals(active, 0);
    assert(peak <= 3);
    assert(peaks[0] <= 1);
    assert(peaks[1] <= 2);
    results.flat().forEach((result, id) => {
      if (id % 11 === 0) {
        assert(result.status === "rejected");
        assert(result.error instanceof RangeError);
        assertEquals(result.error.message, `failed:${id}`);
      } else {
        assert(result.status === "fulfilled");
        assertEquals(result.value, id * 2);
      }
    });
  });
});
