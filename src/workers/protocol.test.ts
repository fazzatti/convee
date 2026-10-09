import { assertEquals } from "@std/assert";
import { contextValid, isReply, PROTOCOL } from "./protocol.ts";

Deno.test("protocol accepts only correlated result, readiness and error envelopes", () => {
  const error = { name: "Error", message: "failed" };
  for (
    const value of [{ protocol: PROTOCOL, kind: "ready", tasks: ["a"] }, {
      protocol: PROTOCOL,
      kind: "fatal",
      error,
    }, {
      protocol: PROTOCOL,
      kind: "result",
      id: "a",
      ok: true,
      value: undefined,
    }, {
      protocol: PROTOCOL,
      kind: "result",
      id: "a",
      ok: false,
      error: { ...error, code: "x", stack: "stack" },
    }]
  ) assertEquals(isReply(value), true);
  for (
    const value of [
      null,
      [],
      {},
      { protocol: "other" },
      { protocol: PROTOCOL, kind: "unknown" },
      { protocol: PROTOCOL, kind: "ready", tasks: ["a", "a"] },
      { protocol: PROTOCOL, kind: "ready", tasks: [1] },
      { protocol: PROTOCOL, kind: "ready", tasks: null },
      { protocol: PROTOCOL, kind: "result", id: 1, ok: true },
      { protocol: PROTOCOL, kind: "result", id: "a", ok: "yes" },
      { protocol: PROTOCOL, kind: "fatal", error: { name: "E", message: 1 } },
      { protocol: PROTOCOL, kind: "fatal", error: { ...error, stack: 1 } },
      { protocol: PROTOCOL, kind: "fatal", error: { ...error, code: 1 } },
    ]
  ) assertEquals(isReply(value), false);
  for (const value of [undefined, {}, { seed: { a: 1 } }, { capture: "all" }]) {
    assertEquals(contextValid(value), true);
  }
  for (const value of [null, [], { seed: [] }, { capture: "invalid" }]) {
    assertEquals(contextValid(value), false);
  }
});
