import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import {
  ConveeError,
  isPipeError,
  isPluginError,
  isStepError,
  step,
} from "../../src/index.ts";
import { deferred, makePlugin, makeUnit, modes } from "../support/runtime.ts";

for (const mode of modes) {
  Deno.test(
    mode + ": callable cannot acquire misleading runtime properties",
    () => {
      const unit = makeUnit(mode, (value) => value);
      assertEquals(Object.isFrozen(unit), true);
      assertEquals(
        Reflect.defineProperty(unit, "execute", { value: () => "hijacked" }),
        false,
      );
    },
  );
  Deno.test(
    mode + ": one error hook cannot rewrite another hook's original input",
    async () => {
      const failure = new Error("failed");
      const unit = makeUnit(mode, () => {
        throw failure;
      }, [
        makePlugin({
          error(error, input) {
            Reflect.set(input as unknown[], 0, 999);
            return error;
          },
        }, "first"),
        makePlugin({
          error(error, input) {
            assertStrictEquals(error, failure);
            assertEquals(input, [3]);
            return 7;
          },
        }, "second"),
      ]);
      assertEquals(await unit(3), 7);
    },
  );
}
for (const mode of ["step", "pipe"] as const) {
  Deno.test(
    mode +
      ": asynchronous hooks cannot expose the plan to returned tuple mutation",
    async () => {
      const entered = deferred(), release = deferred();
      const tuple = [3];
      const unit = makeUnit(mode, async () => {
        entered.resolve();
        await release.promise;
        throw new Error("recover");
      }, [
        makePlugin({ input: () => tuple }, "tuple"),
        makePlugin({
          error(_error, input) {
            assertEquals(input, [3]);
            return 3;
          },
        }, "recover"),
      ]);
      const result = unit(1);
      await entered.promise;
      tuple[0] = 99;
      release.resolve();
      assertEquals(await result, 3);
    },
  );
}
Deno.test("normalized plugin descriptors exclude arbitrary properties from definitions", () => {
  const hook = makePlugin({
    input: (value) => value,
    ...{ unrelated: "not-a-hook" },
  });
  assertEquals("unrelated" in hook, false);
  assertEquals(Object.keys(hook).sort(), [
    "id",
    "input",
    "supports",
    "target",
    "targets",
  ]);
});
Deno.test("non-callable step bodies fail at construction", () => {
  assertThrows(() => Reflect.apply(step, undefined, [null]), TypeError);
});

const variants = [
  ["step", "STP_000", isStepError, { stepId: "s" }],
  ["step", "STP_001", isStepError, {
    stepId: "s",
    pluginId: "p",
    inputArity: 2,
    received: null,
  }],
  ["pipe", "PIP_000", isPipeError, { pipeId: "s" }],
  ["pipe", "PIP_001", isPipeError, {
    pipeId: "s",
    pluginId: "p",
    inputArity: 2,
    received: null,
  }],
  ["pipe", "PIP_002", isPipeError, {
    pipeId: "s",
    pluginId: "p",
    target: "child",
    allowedTargets: ["child"],
  }],
  ["pipe", "PIP_004", isPipeError, { pipeId: "s", stepIds: ["child"] }],
  ["plugin", "PLG_000", isPluginError, { pluginId: "p" }],
  ["plugin", "PLG_001", isPluginError, { capability: "input" }],
] as const;
for (const [domain, code, guard, valid] of variants) {
  const create = (meta: unknown) =>
    new ConveeError({
      domain,
      source: "convee/" + domain,
      code,
      message: "fixture",
      meta: meta as Record<string, unknown>,
    });
  for (const invalid of [undefined, null, {}, 7]) {
    Deno.test(
      code + ": domain guard rejects malformed metadata " +
        JSON.stringify(invalid),
      () => assertEquals(guard(create(invalid)), false),
    );
  }
  Deno.test(
    code + ": domain guard validates all required metadata fields",
    () => {
      assertEquals(guard(create(valid)), true);
      for (const key of Object.keys(valid)) {
        const incomplete: Record<string, unknown> = { ...valid };
        delete incomplete[key];
        assertEquals(guard(create(incomplete)), false, key);
      }
      const hostile = new Proxy({}, {
        get() {
          throw new Error("no access");
        },
      });
      assertEquals(guard(create(hostile)), false);
    },
  );
}
Deno.test("domain guards validate optional strings and array element types", () => {
  assertEquals(
    isStepError(
      new ConveeError({
        domain: "step",
        source: "convee/step",
        code: "STP_000",
        message: "",
        meta: { stepId: "s", pluginId: 1 },
      }),
    ),
    false,
  );
  assertEquals(
    isPipeError(
      new ConveeError({
        domain: "pipe",
        source: "convee/pipe",
        code: "PIP_004",
        message: "",
        meta: { pipeId: "s", stepIds: [1] },
      }),
    ),
    false,
  );
});

Deno.test("serialization preserves built-in error names without evaluating getters", () => {
  for (
    const failure of [
      new TypeError("type"),
      new RangeError("range"),
      new Error("base"),
    ]
  ) {
    assertEquals(
      JSON.parse(JSON.stringify(ConveeError.unexpected({ cause: failure })))
        .cause.name,
      failure.name,
    );
  }
  let reads = 0;
  const failure = new Error("error");
  Object.defineProperty(failure, "name", {
    get() {
      reads++;
      return "computed";
    },
  });
  Object.defineProperty(failure, "message", {
    get() {
      reads++;
      return "computed";
    },
  });
  const sparse = new Array(3);
  Object.defineProperty(sparse, "1", {
    get() {
      reads++;
      return "computed";
    },
  });
  const result = JSON.parse(
    JSON.stringify(
      ConveeError.unexpected({ cause: failure, meta: { sparse } }),
    ),
  );
  assertEquals(result.cause.name, "[Accessor]");
  assertEquals(result.cause.message, "[Accessor]");
  assertEquals(result.meta.sparse, [null, "[Accessor]", null]);
  assertEquals(reads, 0);
});

Deno.test("diagnostics tolerate missing error properties and deep prototype chains", () => {
  const failure = new Error();
  Reflect.deleteProperty(failure, "message");
  let prototype: object = Error.prototype;
  for (let index = 0; index < 12; index++) prototype = Object.create(prototype);
  Object.setPrototypeOf(failure, prototype);
  const result = JSON.parse(
    JSON.stringify(ConveeError.unexpected({ cause: failure })),
  );
  assertEquals(result.cause.name, "Error");
  assertEquals(result.cause.message, "");
});
