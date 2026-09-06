import { assertEquals, assertRejects } from "@std/assert";
import { createRunContext, pipe, plugin, step } from "../../src/index.ts";

Deno.test("consumer fixture: parse, validate, enrich and audit an order", async () => {
  const parse = step(
    (text: string): { quantity: number; sku: string } => JSON.parse(text),
    { id: "parse" },
  );
  const validate = step((order: { quantity: number; sku: string }) => {
    if (!Number.isInteger(order.quantity) || order.quantity <= 0) {
      throw new Error("invalid quantity");
    }
    return order;
  }, { id: "validate" });
  const price = step(
    (order: { quantity: number; sku: string }) => ({
      ...order,
      total: order.quantity * 7,
    }),
    { id: "price" },
  );
  const context = createRunContext({
    seed: { requestId: "fixture" },
    capture: "all",
  });
  const audit: string[] = [];
  const unit = pipe([parse, validate, price], {
    plugins: [
      plugin.for<[string], { quantity: number; sku: string; total: number }>()({
        output(order) {
          audit.push(String(this.context().state.get("requestId")));
          return order;
        },
      }),
    ],
  });
  assertEquals(
    await unit.runWith(
      { context: { parent: context } },
      '{"quantity":3,"sku":"A"}',
    ),
    { quantity: 3, sku: "A", total: 21 },
  );
  assertEquals(audit, ["fixture"]);
  await assertRejects(
    () => unit('{"quantity":0,"sku":"A"}'),
    Error,
    "invalid quantity",
  );
  assertEquals(audit.length, 1);
});
