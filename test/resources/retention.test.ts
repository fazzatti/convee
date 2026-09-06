import { assertEquals } from "@std/assert";
import {
  createRunContext,
  type RunContextCapture,
  step,
} from "../../src/index.ts";

const collect = Reflect.get(globalThis, "gc") as (() => void) | undefined;
if (!collect) {
  throw new Error(
    "Run deno task test:resources to enable explicit V8 collection.",
  );
}
function populate(capture: RunContextCapture) {
  const context = createRunContext({ capture });
  const references: WeakRef<object>[] = [];
  const unit = step.sync((input: { bytes: Uint8Array }) => input.bytes.length, {
    id: "fixed",
  });
  for (let index = 0; index < 5000; index++) {
    const payload = { bytes: new Uint8Array(1024) };
    references.push(new WeakRef(payload));
    unit.runWith({ context: { parent: context } }, payload);
  }
  return { context, references };
}
for (const capture of ["none", "outputs", "all"] as const) {
  Deno.test(
    capture + ": completed frames do not retain 5000 distinct input objects",
    async () => {
      const { context, references } = populate(capture);
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        collect();
      }
      assertEquals(
        references.slice(0, -1).filter((reference) => reference.deref()).length,
        0,
      );
      assertEquals(Boolean(references.at(-1)!.deref()), capture === "all");
      assertEquals(context.step.all().length, 1);
      assertEquals(
        context.step.previous()?.output,
        capture === "none" ? undefined : 1024,
      );
    },
  );
}
