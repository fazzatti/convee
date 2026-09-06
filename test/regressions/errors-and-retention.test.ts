import {
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import {
  ConveeError,
  createRunContext,
  isPipeError,
  isPluginError,
  isStepError,
  step,
} from "../../src/index.ts";
import { RunContextController } from "../../src/context/runtime.ts";
import { deferred } from "../support/runtime.ts";

for (
  const [label, cause] of [
    ["undefined", undefined],
    ["null", null],
    ["bigint", 4n],
    ["symbol", Symbol("value")],
    ["function", () => 3],
    ["native error", new Error("failed")],
    ["structured error", ConveeError.unexpected({ meta: { number: 2n } })],
    ["branded shape", {
      [Symbol.for("convee/ConveeError")]: true,
      code: "CUSTOM",
      domain: "core",
      source: "test",
      message: "shape",
    }],
    ["array", [2n, undefined, "value"]],
    ["NaN", NaN],
    ["infinity", Infinity],
  ] as const
) {
  Deno.test(`error serialization safely projects ${label}`, () => {
    const error = ConveeError.unexpected({ cause, meta: { cause } });
    const serialized = JSON.stringify(error);
    assertEquals(typeof serialized, "string");
    assertStrictEquals(error.cause, cause);
    assertEquals(JSON.parse(serialized).code, "UNEXPECTED");
  });
}
Deno.test("serialization is bounded, handles cycles and does not invoke custom toJSON or getters", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  let effects = 0;
  circular.toJSON = () => {
    effects++;
    throw new Error("must not call");
  };
  Object.defineProperty(circular, "secret", {
    enumerable: true,
    get: () => {
      effects++;
      throw new Error("must not call");
    },
  });
  const error = ConveeError.unexpected({ cause: circular });
  const result = JSON.parse(JSON.stringify(error));
  assertEquals(result.cause.self, "[Circular]");
  assertEquals(result.cause.secret, "[Accessor]");
  assertEquals(effects, 0);
  let deep: unknown = "leaf";
  for (let index = 0; index < 100; index++) deep = { deep };
  assertEquals(
    JSON.stringify(ConveeError.unexpected({ cause: deep })).includes(
      "[Truncated]",
    ),
    true,
  );
});
Deno.test("hostile diagnostic objects cannot crash serialization", () => {
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error("hostile");
    },
  });
  assertEquals(
    JSON.parse(JSON.stringify(ConveeError.unexpected({ cause: hostile })))
      .cause,
    "[Unserializable]",
  );
});
for (
  const [domain, guard] of [["step", isStepError], ["pipe", isPipeError], [
    "plugin",
    isPluginError,
  ]] as const
) {
  Deno.test(`catalog guard rejects unknown ${domain} codes`, () => {
    assertEquals(
      guard(
        new ConveeError({
          domain,
          source: `convee/${domain}`,
          code: "NOT_IN_CATALOG",
          message: "unknown",
        }),
      ),
      false,
    );
  });
}
Deno.test("branded objects without Error behavior are not runtime error instances", () => {
  const shape = {
    [Symbol.for("convee/ConveeError")]: true,
    domain: "core",
    code: "X",
    source: "test",
    message: "shape",
  };
  assertEquals(ConveeError.is(shape), false);
  const normalized = ConveeError.fromUnknown(shape);
  assertInstanceOf(normalized, ConveeError);
  assertEquals(typeof normalized.toJSON(), "object");
});
for (const capture of ["none", "outputs", "all"] as const) {
  Deno.test(`${capture}: 10000 invocations retain per-ID snapshots, not every frame`, () => {
    const parent = createRunContext({ capture });
    const unit = step.sync(function (value: number) {
      this.context().step.current().state.set("visits", value);
      return value + 1;
    }, { id: "repeat" });
    for (let index = 0; index < 10000; index++) {
      unit.runWith({ context: { parent } }, index);
    }
    assertEquals(parent.step.all().length, 1);
    assertEquals(parent.step.get("repeat")?.state.get("visits"), 9999);
    assertEquals(
      parent.step.previous()?.output,
      capture === "none" ? undefined : 10000,
    );
    assertEquals(
      parent.step.previous()?.input,
      capture === "all" ? [9999] : undefined,
    );
    const controller = RunContextController.from(parent);
    assertEquals(Reflect.has(controller, "stepVisits"), false);
    assertEquals(Reflect.get(controller, "stepStack").length, 0);
  });
}
Deno.test("snapshot arrays and entries own their structure but retain payload identity", async () => {
  const parent = createRunContext({ capture: "all" });
  const payload = { count: 1 };
  const unit = step((value: typeof payload) => value, { id: "payload" });
  await unit.runWith({ context: { parent } }, payload);
  const input = parent.step.get("payload")!.input!;
  Reflect.set(input, 0, "changed");
  assertStrictEquals(parent.step.get("payload")?.input?.[0], payload);
  Reflect.set(parent.step.all()[0].input!, 0, "changed");
  Reflect.set(parent.step.previous()!.input!, 0, "changed");
  assertStrictEquals(parent.step.get("payload")?.input?.[0], payload);
  parent.state.set("count", 1);
  const entries = parent.state.entries();
  parent.state.set("count", 2);
  assertEquals(entries.get("count"), 1);
  payload.count = 3;
  assertEquals((parent.step.get("payload")?.output as typeof payload).count, 3);
});
Deno.test("input snapshots cannot change through the caller's mutable tuple", async () => {
  const entered = deferred();
  const release = deferred();
  const parent = createRunContext({ capture: "all" });
  const args: [number] = [1];
  const unit = step(async function (value: number) {
    entered.resolve();
    await release.promise;
    assertEquals(this.context().step.current().input, [1]);
    return value;
  });
  const result = unit.runWith({ context: { parent } }, ...args);
  await entered.promise;
  args[0] = 99;
  release.resolve();
  assertEquals(await result, 1);
  assertThrows(() => parent.step.current(), Error);
});
