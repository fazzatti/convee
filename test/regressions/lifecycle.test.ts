import {
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { ConveeError, createRunContext } from "../../src/index.ts";
import {
  type Body,
  type Hooks,
  makePlugin,
  makeUnit,
  modes,
} from "../support/runtime.ts";

const failures = [
  new Error("native"),
  new RangeError("subclass"),
  "text",
  0,
  null,
  undefined,
  { problem: "object" },
  99n,
];
for (const mode of modes) {
  for (const phase of ["input", "run", "output", "error"] as const) {
    for (const [index, failure] of failures.entries()) {
      Deno.test(`${mode}: ${phase} failure ${index} normalizes, records and closes frames`, async () => {
        const context = createRunContext({ capture: "all" });
        let view: ReturnType<typeof createRunContext> | undefined;
        const fail: Body = function () {
          view = this.context();
          throw failure;
        };
        const hooks: Hooks = phase === "run" ? {} : { [phase]: fail };
        if (phase === "error") hooks.input = (value) => value;
        const body: Body = phase === "run" ? fail : phase === "error"
          ? () => {
            throw new Error("trigger");
          }
          : (value) => value;
        const unit = makeUnit(
          mode,
          body,
          Object.keys(hooks).length ? [makePlugin(hooks)] : [],
        );
        const error = await assertRejects(async () => {
          await unit.runWith({ context: { parent: context } }, 4);
        }, Error);
        if (failure instanceof Error) assertStrictEquals(error, failure);
        else if (typeof failure === "string") {
          assertEquals(error.message, failure);
        } else {
          assertInstanceOf(error, ConveeError);
          assertStrictEquals(error.cause, failure);
        }
        assertStrictEquals(context.step.get("unit")?.error, error);
        assertThrows(() => view!.step.current(), Error);
        if (phase !== "run") assertThrows(() => view!.plugin.current(), Error);
        assertThrows(() => context.step.current(), Error);
      });
    }
  }

  for (let mask = 1; mask < 8; mask++) {
    Deno.test(`${mode}: hook combination ${mask} has deterministic order`, async () => {
      const calls: string[] = [];
      const hooks: Hooks = {};
      if (mask & 1) {
        hooks.input = (value) => {
          calls.push("input");
          return Number(value) + 1;
        };
      }
      if (mask & 2) {
        hooks.output = (value) => {
          calls.push("output");
          return Number(value) * 2;
        };
      }
      if (mask & 4) {
        hooks.error = () => {
          calls.push("error");
          return 5;
        };
      }
      const unit = makeUnit(mode, (value) => {
        calls.push("run");
        return Number(value) + 3;
      }, [makePlugin(hooks)]);
      assertEquals(
        await unit(2),
        (5 + (mask & 1 ? 1 : 0)) * (mask & 2 ? 2 : 1),
      );
      assertEquals(calls, [
        ...(mask & 1 ? ["input"] : []),
        "run",
        ...(mask & 2 ? ["output"] : []),
      ]);
    });
  }

  Deno.test(`${mode}: successful output hooks never replay after a later failure`, async () => {
    let effects = 0;
    let recoveries = 0;
    const unit = makeUnit(mode, () => 1, [
      makePlugin({
        output: (value) => {
          effects++;
          return value;
        },
      }, "first"),
      makePlugin({
        output: () => {
          throw new Error("output failed");
        },
      }, "second"),
      makePlugin({
        error: () => {
          recoveries++;
          return 3;
        },
      }, "recover"),
    ]);
    await assertRejects(
      async () => {
        await unit();
      },
      Error,
      "output failed",
    );
    assertEquals(effects, 1);
    assertEquals(recoveries, 0);
  });

  Deno.test(`${mode}: input validation cannot be bypassed by recovery`, async () => {
    let calls = 0;
    const unit = makeUnit(mode, () => {
      calls++;
      return 1;
    }, [makePlugin({
      input: () => {
        throw new Error("invalid");
      },
      error: () => {
        calls++;
        return 4;
      },
    })]);
    await assertRejects(
      async () => {
        await unit(1);
      },
      Error,
      "invalid",
    );
    assertEquals(calls, 0);
  });

  Deno.test(`${mode}: body recovery enters output once, short circuits remaining recoveries`, async () => {
    const calls: string[] = [];
    const unit = makeUnit(mode, () => {
      throw new Error("fail");
    }, [
      makePlugin({
        error: (error) => {
          calls.push("propagate");
          return error;
        },
      }, "first"),
      makePlugin({
        error: () => {
          calls.push("recover");
          return 3;
        },
        output: (value) => {
          calls.push("output");
          return Number(value) * 4;
        },
      }, "second"),
      makePlugin({
        error: () => {
          calls.push("unreachable");
          return 8;
        },
      }, "last"),
    ]);
    assertEquals(await unit(1), 12);
    assertEquals(calls, ["propagate", "recover", "output"]);
  });
}
