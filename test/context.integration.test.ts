import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";

import { createRunContext, plugin, step, type PluginThis } from "@convee";

describe("Integration: Context", () => {
  describe("case-by-case scenarios", () => {
    type Shared = {
      requestId: string;
      trace: string[];
      total?: number;
      pluginMode?: string;
    };

    const contextualStep = step.withContext<Shared>()(function (
      value: number,
      offset: number,
    ) {
      const trace = [...(this.context().state.get("trace") ?? [])];
      trace.push(`step:${value}:${offset}`);
      this.context().state.set("trace", trace);
      this.context().state.set("total", value + offset);
      return (
        Number(this.context().state.get("requestId") ?? 0) + value + offset
      );
    });

    const plusTwoPlugin = () =>
      plugin
        .withContext<Shared>()()
        .onOutput(function (this: PluginThis<Shared>, output: number) {
          const trace = [...(this.context().state.get("trace") ?? [])];
          trace.push("plugin:plus-two");
          this.context().state.set("trace", trace);
          this.context().state.set("pluginMode", "plus-two");
          this.context().plugin.current().state.set("pluginMode", "plus-two");
          return output + 2;
        });

    const doublePlugin = () =>
      plugin
        .withContext<Shared>()()
        .onOutput(function (this: PluginThis<Shared>, output: number) {
          const trace = [...(this.context().state.get("trace") ?? [])];
          trace.push("plugin:double");
          this.context().state.set("trace", trace);
          this.context().state.set("pluginMode", "double");
          this.context().plugin.current().state.set("pluginMode", "double");
          return output * 2;
        });

    async function runScenario(options: {
      capture: "none" | "outputs" | "all";
      requestId: string;
      value: number;
      offset: number;
      plugin?:
        | ReturnType<typeof plusTwoPlugin>
        | ReturnType<typeof doublePlugin>;
      expectedPluginMode?: Shared["pluginMode"];
    }) {
      const traceSeed = [`seed:${options.capture}:${options.requestId}`];
      const parent = createRunContext<Shared>({
        capture: options.capture,
        seed: {
          requestId: options.requestId,
          trace: traceSeed,
        },
      });

      const result = await contextualStep.runWith(
        {
          context: {
            parent,
          },
          plugins: options.plugin ? [options.plugin] : [],
        },
        options.value,
        options.offset,
      );

      return { parent, result, traceSeed };
    }

    it("keeps only shared state when capture is none and no plugin is used", async () => {
      const { parent, result, traceSeed } = await runScenario({
        capture: "none",
        requestId: "1",
        value: -5,
        offset: 0,
      });

      assertEquals(result, -4);
      assertEquals(parent.state.get("trace"), [...traceSeed, "step:-5:0"]);
      assertEquals(parent.state.get("total"), -5);
      assertEquals(parent.state.get("pluginMode"), undefined);
      assertEquals(parent.plugin.all().length, 0);

      const stepSnapshot = parent.step.get(contextualStep.id);
      assertExists(stepSnapshot);
      assertEquals(stepSnapshot?.input, undefined);
      assertEquals(stepSnapshot?.output, undefined);
    });

    it("captures only outputs when capture is outputs", async () => {
      const { parent, result, traceSeed } = await runScenario({
        capture: "outputs",
        requestId: "5",
        value: 3,
        offset: 2,
      });

      assertEquals(result, 10);
      assertEquals(parent.state.get("trace"), [...traceSeed, "step:3:2"]);

      const stepSnapshot = parent.step.get(contextualStep.id);
      assertExists(stepSnapshot);
      assertEquals(stepSnapshot?.input, undefined);
      assertEquals(stepSnapshot?.output, 10);
    });

    it("captures both input and output when capture is all", async () => {
      const { parent, result, traceSeed } = await runScenario({
        capture: "all",
        requestId: "10",
        value: 4,
        offset: 2,
      });

      assertEquals(result, 16);
      assertEquals(parent.state.get("trace"), [...traceSeed, "step:4:2"]);

      const stepSnapshot = parent.step.get(contextualStep.id);
      assertExists(stepSnapshot);
      assertEquals(stepSnapshot?.input, [4, 2]);
      assertEquals(stepSnapshot?.output, 16);
    });

    it("applies the plus-two plugin as a single-use output plugin", async () => {
      const { parent, result, traceSeed } = await runScenario({
        capture: "outputs",
        requestId: "5",
        value: 1,
        offset: 0,
        plugin: plusTwoPlugin(),
      });

      assertEquals(result, 8);
      assertEquals(parent.state.get("trace"), [
        ...traceSeed,
        "step:1:0",
        "plugin:plus-two",
      ]);
      assertEquals(parent.state.get("pluginMode"), "plus-two");
      assertEquals(parent.plugin.all().length, 1);
      assertEquals(parent.plugin.all()[0]?.state.get("pluginMode"), "plus-two");
    });

    it("applies the double plugin after the step output", async () => {
      const { parent, result, traceSeed } = await runScenario({
        capture: "all",
        requestId: "25",
        value: 2,
        offset: 2,
        plugin: doublePlugin(),
      });

      assertEquals(result, 58);
      assertEquals(parent.state.get("trace"), [
        ...traceSeed,
        "step:2:2",
        "plugin:double",
      ]);

      const stepSnapshot = parent.step.get(contextualStep.id);
      assertExists(stepSnapshot);
      assertEquals(stepSnapshot?.input, [2, 2]);
      assertEquals(stepSnapshot?.output, 58);
      assertEquals(parent.plugin.all()[0]?.state.get("pluginMode"), "double");
    });

    it("lets seeded request ids change the base calculation", async () => {
      const lowRequest = await runScenario({
        capture: "outputs",
        requestId: "1",
        value: 5,
        offset: 2,
      });
      const highRequest = await runScenario({
        capture: "outputs",
        requestId: "25",
        value: 5,
        offset: 2,
      });

      assertEquals(lowRequest.result, 8);
      assertEquals(highRequest.result, 32);
    });

    it("keeps plugin snapshots isolated to runs that actually use a plugin", async () => {
      const firstRun = await runScenario({
        capture: "all",
        requestId: "10",
        value: 0,
        offset: 0,
      });
      const secondRun = await runScenario({
        capture: "all",
        requestId: "10",
        value: 0,
        offset: 0,
        plugin: plusTwoPlugin(),
      });

      assertEquals(firstRun.parent.plugin.all().length, 0);
      assertEquals(secondRun.parent.plugin.all().length, 1);
      assertEquals(
        secondRun.parent.plugin.all()[0]?.state.get("pluginMode"),
        "plus-two",
      );
    });

    it("records plugin traces after step traces in shared state", async () => {
      const { parent } = await runScenario({
        capture: "all",
        requestId: "5",
        value: -1,
        offset: 2,
        plugin: doublePlugin(),
      });

      assertEquals(parent.state.get("trace"), [
        "seed:all:5",
        "step:-1:2",
        "plugin:double",
      ]);
    });

    it("supports connector-like object workflows with shared context", async () => {
      type Shared = {
        audit: string[];
        requestId: string;
        lastOrderId?: string;
      };

      const buildOrder = step.withContext<Shared>()(function (input: {
        orderId: string;
        items: Array<{ price: number; quantity: number }>;
        premium: boolean;
      }) {
        const subtotal = input.items.reduce(
          (total, item) => total + item.price * item.quantity,
          0,
        );
        this.context().state.set("lastOrderId", input.orderId);
        this.context().state.set("audit", [
          ...(this.context().state.get("audit") ?? []),
          `build:${input.orderId}`,
        ]);
        return {
          orderId: input.orderId,
          subtotal,
          premium: input.premium,
        };
      });

      const finalizeOrder = step.withContext<Shared>()(function (built: {
        orderId: string;
        subtotal: number;
        premium: boolean;
      }) {
        this.context().state.set("audit", [
          ...(this.context().state.get("audit") ?? []),
          `finalize:${built.orderId}`,
        ]);
        return {
          ...built,
          total: built.premium ? built.subtotal * 0.9 : built.subtotal,
          requestId: this.context().state.get("requestId"),
          lastOrderId: this.context().state.get("lastOrderId"),
        };
      });

      const parent = createRunContext<Shared>({
        capture: "all",
        seed: {
          requestId: "req-42",
          audit: [],
        },
      });

      const built = await buildOrder.runWith(
        { context: { parent } },
        {
          orderId: "ord-1",
          items: [
            { price: 10, quantity: 2 },
            { price: 5, quantity: 3 },
          ],
          premium: true,
        },
      );
      const finalized = await finalizeOrder.runWith(
        { context: { parent } },
        built,
      );

      assertEquals(finalized, {
        orderId: "ord-1",
        subtotal: 35,
        premium: true,
        total: 31.5,
        requestId: "req-42",
        lastOrderId: "ord-1",
      });
      assertEquals(parent.state.get("audit"), [
        "build:ord-1",
        "finalize:ord-1",
      ]);
      assertEquals(parent.step.get(buildOrder.id)?.output, built);
      assertEquals(parent.step.get(finalizeOrder.id)?.output, finalized);
    });
  });
});
