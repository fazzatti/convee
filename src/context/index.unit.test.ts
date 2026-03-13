import { assertEquals, assertThrows } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import { createRunContext, RunContextController } from "@/context/index.ts";

describe("RunContext", () => {
  it("stores seeded execution state", () => {
    const context = createRunContext<{
      requestId: string;
      attempts?: number;
    }>({
      seed: {
        requestId: "req-1",
      },
    });

    assertEquals(context.state.get("requestId"), "req-1");
    assertEquals(context.state.has("requestId"), true);

    context.state.set("attempts", 2);
    assertEquals(context.state.get("attempts"), 2);
    assertEquals(Array.from(context.state.entries().entries()), [
      ["requestId", "req-1"],
      ["attempts", 2],
    ]);

    assertEquals(context.state.delete("attempts"), true);
    assertEquals(context.state.get("attempts"), undefined);

    context.state.clear();
    assertEquals(Array.from(context.state.entries().entries()), []);
  });

  it("tracks step and plugin snapshots with full capture", () => {
    const context = createRunContext({ capture: "all" });
    const controller = RunContextController.from(context);

    controller.enterStep("first-step", [1]);
    controller.updateCurrentStepInput([2]);
    assertEquals(context.step.current().id, "first-step");
    assertEquals(context.step.previous(), undefined);

    controller.enterPlugin("audit-plugin", "first-step");
    context.plugin.current().state.set("started", true);
    assertEquals(context.plugin.current().id, "audit-plugin");
    controller.leavePlugin();

    controller.updateCurrentStepOutput(4);
    controller.updateCurrentStepError(new Error("boom"));
    controller.leaveStep();

    controller.enterStep("second-step", [5]);
    assertEquals(context.step.previous()?.id, "first-step");
    controller.leaveStep();

    assertEquals(context.step.get("first-step")?.input, [2]);
    assertEquals(context.step.get("first-step")?.output, 4);
    assertEquals(context.step.get("first-step")?.error?.message, "boom");
    assertEquals(context.step.all().length, 2);
    assertEquals(context.plugin.get("audit-plugin")?.target, "first-step");
    assertEquals(
      context.plugin.get("audit-plugin")?.state.get("started"),
      true,
    );
    assertEquals(context.plugin.all().length, 1);
  });

  it("reuses existing snapshots and returns undefined for unknown ids", () => {
    const context = createRunContext({ capture: "all" });
    const controller = RunContextController.from(context);

    controller.enterStep("repeat-step", [1]);
    context.step.current().state.set("visits", 1);
    controller.leaveStep();

    controller.enterStep("repeat-step", [2]);
    assertEquals(context.step.current().state.get("visits"), 1);
    controller.leaveStep();

    assertEquals(context.step.get("missing-step"), undefined);
    assertEquals(context.plugin.get("missing-plugin"), undefined);
  });

  it("returns undefined when previous-step lookup has no frame", () => {
    const context = createRunContext({ capture: "all" });
    const controller = RunContextController.from(context) as unknown as {
      stepVisits: { length: number; at(index: number): unknown };
    };

    controller.stepVisits = {
      length: 2,
      at: () => undefined,
    };

    assertEquals(context.step.previous(), undefined);
  });

  it("keeps only outputs when using output capture", () => {
    const context = createRunContext({ capture: "outputs" });
    const controller = RunContextController.from(context);

    controller.enterStep("output-step", [1]);
    controller.updateCurrentStepInput([2]);
    controller.updateCurrentStepOutput(3);
    controller.updateCurrentStepError(new Error("ignored"));
    controller.leaveStep();

    assertEquals(context.step.get("output-step")?.input, undefined);
    assertEquals(context.step.get("output-step")?.output, 3);
    assertEquals(context.step.get("output-step")?.error, undefined);
  });

  it("keeps only scoped state when using no capture", () => {
    const context = createRunContext({ capture: "none" });
    const controller = RunContextController.from(context);

    controller.enterStep("state-only-step", [1]);
    context.step.current().state.set("kept", true);
    controller.updateCurrentStepOutput(3);
    controller.leaveStep();

    assertEquals(context.step.get("state-only-step")?.input, undefined);
    assertEquals(context.step.get("state-only-step")?.output, undefined);
    assertEquals(context.step.get("state-only-step")?.state.get("kept"), true);
  });

  it("reuses a parent context and applies seeded values onto it", () => {
    const parent = createRunContext<{ requestId: string; actorId?: string }>({
      seed: {
        requestId: "req-1",
      },
    });
    const child = createRunContext({
      parent,
      seed: {
        actorId: "user-1",
      },
    });

    assertEquals(child, parent);
    assertEquals(parent.state.get("requestId"), "req-1");
    assertEquals(parent.state.get("actorId"), "user-1");
  });

  it("throws for invalid current-frame access and invalid controller usage", () => {
    const context = createRunContext();
    const controller = RunContextController.from(context);

    assertThrows(() => context.step.current(), Error);
    assertThrows(() => context.plugin.current(), Error);
    assertThrows(() => controller.leaveStep(), Error);
    assertThrows(() => controller.leavePlugin(), Error);
    assertThrows(() => RunContextController.from({} as never), TypeError);
  });
});
