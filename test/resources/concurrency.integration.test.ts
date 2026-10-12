import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { concurrent } from "@convee";

describe("Concurrent resource retention", () => {
  const gc = Reflect.get(globalThis, "gc") as (() => void) | undefined;
  if (!gc) {
    throw new Error(
      "Run deno task test:resources with explicit V8 collection.",
    );
  }
  for (const capacityScope of ["invocation", "shared"] as const) {
    it(`releases completed inputs, descriptors and cancellation listeners with ${capacityScope} capacity`, async () => {
      const signal = new AbortController().signal;
      const unit = concurrent({
        capacityScope,
        tasks: {
          length: async (input: { bytes: Uint8Array }) => {
            await Promise.resolve();
            return input.bytes.length;
          },
        },
        split: (
          tasks,
          input: { bytes: Uint8Array },
        ) => [tasks.length.job(input)],
        join: ([size]) => size,
      });
      async function populate() {
        const references: WeakRef<object>[] = [];
        for (let index = 0; index < 1000; index++) {
          const input = { bytes: new Uint8Array(128) };
          references.push(new WeakRef(input));
          assertEquals(
            await unit.runWith({ signal, context: { capture: "none" } }, input),
            128,
          );
        }
        return references;
      }
      const references = await populate();
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        gc();
      }
      assertEquals(
        references.filter((reference) => reference.deref()).length,
        0,
      );
      assertEquals(await unit({ bytes: new Uint8Array(1) }), 1);
    });
  }
});
