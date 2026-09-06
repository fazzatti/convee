import { createRunContext, pipe, plugin, step } from "../src/index.ts";

const raw = (value: number) => value + 1;
Deno.bench("direct callback baseline", () => {
  raw(1);
});
for (const capture of ["none", "outputs", "all"] as const) {
  for (const count of [0, 1, 5, 20]) {
    const hooks = Array.from(
      { length: count },
      () => plugin.sync.for<[number], number>()({ output: raw }),
    );
    const unit = step.sync(raw, { plugins: hooks });
    const context = createRunContext({ capture });
    Deno.bench(`sync step: capture=${capture}, hooks=${count}`, () => {
      unit.runWith({ context: { parent: context } }, 1);
    });
  }
}
const asyncStep = step(raw);
Deno.bench("async step fresh context", async () => {
  await asyncStep(1);
});
const ten = pipe.sync([raw, raw, raw, raw, raw, raw, raw, raw, raw, raw]);
Deno.bench("ten sync raw steps", () => {
  ten(1);
});
const nested = pipe([pipe([pipe([raw])])]);
Deno.bench("three nested async pipes", async () => {
  await nested(1);
});
