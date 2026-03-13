import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";

import { step } from "@convee";

const sumTwoFn = (a: number, b: number) => a + b;

const makeSumTwoStep = () =>
  step(sumTwoFn, {
    id: "SUM-TWO",
  });
describe("Integration: Single Step", () => {
  describe("creation and setup", () => {
    it("creates a minimal callable step", async () => {
      const sumStep = step(sumTwoFn);

      assertExists(sumStep.id);
      assertEquals(await sumStep(2, 3), 5);
    });

    it("supports single-argument string steps", async () => {
      const shoutStep = step((value: string) => value.toUpperCase());

      assertExists(shoutStep.id);
      assertEquals(await shoutStep("hello"), "HELLO");

      if (false) {
        // @ts-expect-error string step rejects numbers
        await shoutStep(123);
      }
    });

    it("supports zero-argument steps", async () => {
      const nowStep = step(() => "ready");

      assertExists(nowStep.id);
      assertEquals(await nowStep(), "ready");

      if (false) {
        // @ts-expect-error zero-argument steps reject extra arguments
        await nowStep("unexpected");
      }
    });

    it("supports complex object inputs and outputs", async () => {
      const orderStep = step(
        (order: {
          id: string;
          items: Array<{ sku: string; price: number; quantity: number }>;
          customer: { tier: "standard" | "premium" };
        }) => {
          const subtotal = order.items.reduce(
            (total, item) => total + item.price * item.quantity,
            0,
          );

          return {
            orderId: order.id,
            subtotal,
            discount: order.customer.tier === "premium" ? 0.1 : 0,
            total:
              order.customer.tier === "premium" ? subtotal * 0.9 : subtotal,
          };
        },
      );

      const result = await orderStep({
        id: "order-1",
        items: [
          { sku: "a", price: 10, quantity: 2 },
          { sku: "b", price: 5, quantity: 1 },
        ],
        customer: { tier: "premium" },
      });

      assertEquals(result, {
        orderId: "order-1",
        subtotal: 25,
        discount: 0.1,
        total: 22.5,
      });

      if (false) {
        await orderStep({
          id: "order-1",
          items: [
            {
              sku: "a",
              // @ts-expect-error complex object steps validate nested shapes
              price: "10",
              quantity: 2,
            },
          ],
          customer: { tier: "premium" },
        });
      }
    });

    it("supports tuple outputs for downstream composition", async () => {
      const statsStep = step(
        (value: number) => [value + 1, value * 2] as [number, number],
      );

      assertEquals(await statsStep(3), [4, 6]);
    });

    it("supports multi-argument object composition", async () => {
      const mergeUserStep = step(
        (
          profile: { id: string; name: string },
          settings: { theme: "light" | "dark"; compact: boolean },
        ) => ({
          ...profile,
          settings,
          summary: `${profile.name}:${settings.theme}:${settings.compact}`,
        }),
      );

      assertEquals(
        await mergeUserStep(
          { id: "u1", name: "Ada" },
          { theme: "dark", compact: true },
        ),
        {
          id: "u1",
          name: "Ada",
          settings: { theme: "dark", compact: true },
          summary: "Ada:dark:true",
        },
      );
    });

    it("supports union-shaped inputs", async () => {
      const identifierStep = step((input: { id: string } | { slug: string }) =>
        "id" in input ? `id:${input.id}` : `slug:${input.slug}`,
      );

      assertEquals(await identifierStep({ id: "123" }), "id:123");
      assertEquals(await identifierStep({ slug: "post" }), "slug:post");
    });

    it("sumTwo accepts only numbers as arguments at the type level", async () => {
      const sumTwo = makeSumTwoStep();

      assertEquals(await sumTwo(2, 2), 4);
      assertEquals(await sumTwo(1, 2), 3);

      if (false) {
        // @ts-expect-error
        await sumTwo("2", 3);

        // @ts-expect-error
        await sumTwo(2, "3");

        // @ts-expect-error
        await sumTwo(2, {});
      }
    });
  });
});
