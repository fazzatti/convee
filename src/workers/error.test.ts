import { assertEquals } from "@std/assert";
import { remoteError, WorkerError } from "./error.ts";

Deno.test("worker errors retain adapter identity and project remote errors deliberately", () => {
  const cause = new Error("original");
  const error = new WorkerError("WRK_TASK", "failed", { jobId: "a" }, cause);
  assertEquals(error.domain, "worker");
  assertEquals(error.cause, cause);
  const report = remoteError(error);
  assertEquals(report.name, "WorkerError");
  assertEquals(report.message, "failed");
  assertEquals(report.code, "WRK_TASK");
  const plain = new Error("plain");
  delete plain.stack;
  assertEquals(remoteError(plain), { name: "Error", message: "plain" });
  assertEquals(remoteError("text"), { name: "NonError", message: "text" });
  assertEquals(remoteError(undefined).message, "undefined");
  const hostile = {
    toString() {
      throw new Error("no");
    },
  };
  assertEquals(
    remoteError(hostile).message,
    "Unable to inspect the remote thrown value.",
  );
});
