import { assertEquals, assertThrows } from "@std/assert";
import { plugin, step } from "@convee";
import { assemble } from "@/workers/assemble.ts";
import { recipes } from "@/workers/config.ts";
import { workerRegistry } from "@/workers/registry.ts";
import { WorkerError } from "@/workers/error.ts";
import registry from "@test/workers/registry.ts";
import { describe, it } from "@std/testing/bdd";

describe("Worker assembly", () => {
  const role = { name: "test", size: 1, plugins: {} };

  it("assembly retains tuple transport, nested gates and explicit child plugin placement", async () => {
    const tasks = assemble(
      registry,
      recipes({
        p: {
          steps: [
            { task: "double", plugins: [{ name: "increment" }] },
            "tuple",
            "pair",
          ],
          plugins: [{ name: "prefix", options: { text: "done:" } }],
        },
      }),
      { ...role, tasks: ["p"] },
    );
    assertEquals(await tasks.get("p")!(2), "done:ok:6");
    const configured = assemble(registry, {}, {
      ...role,
      tasks: ["double"],
      plugins: { double: [{ name: "add", options: { amount: 3 } }] },
    });
    assertEquals(await configured.get("double")!(2), 7);
  });

  it("assembly rejects unknown names, shadowed tasks and unavailable role plugins", () => {
    assertThrows(
      () =>
        assemble(registry, recipes({ double: { steps: ["double"] } }), role),
      WorkerError,
      "shadow",
    );
    assertThrows(
      () => assemble(registry, recipes({ p: { steps: ["missing"] } }), role),
      WorkerError,
      "Unknown registered",
    );
    assertThrows(
      () =>
        assemble(
          registry,
          recipes({ p: { steps: ["double"], plugins: [{ name: "missing" }] } }),
          role,
        ),
      WorkerError,
      "Unknown worker plugin",
    );
    assertThrows(
      () =>
        assemble(registry, {}, {
          ...role,
          tasks: ["double"],
          plugins: { label: [] },
        }),
      WorkerError,
      "unavailable",
    );
  });

  it("factories must create callable tasks and materialized untargeted plugins", () => {
    const badTask = workerRegistry({
      tasks: { broken: () => 1 as unknown as () => number },
    });
    assertThrows(
      () => assemble(badTask, {}, role),
      WorkerError,
      "synchronously return",
    );
    for (const invalid of [null, 1, {}, { id: "x" }]) {
      const bad = workerRegistry({
        tasks: { task: () => () => 1 },
        plugins: { bad: () => invalid as { id: string } },
      });
      assertThrows(
        () =>
          assemble(
            bad,
            recipes({ p: { steps: ["task"], plugins: [{ name: "bad" }] } }),
            role,
          ),
        WorkerError,
        "materialized",
      );
    }
    const targeted = workerRegistry({
      tasks: { task: () => step(() => 1) },
      plugins: { p: () => plugin({ target: "x" }).onOutput((n: number) => n) },
    });
    assertThrows(
      () =>
        assemble(
          targeted,
          recipes({ p: { steps: ["task"], plugins: [{ name: "p" }] } }),
          role,
        ),
      WorkerError,
      "untargeted",
    );
  });

  it("task aliases that match Object prototype names are ordinary registered names", async () => {
    const special = workerRegistry({ tasks: { toString: () => () => "safe" } });
    assertEquals(await assemble(special, {}, role).get("toString")!(), "safe");
  });
});
