import { assertEquals } from "@std/assert";
import { remoteError, WorkerError } from "@/workers/error.ts";
import { describe, it } from "@std/testing/bdd";

describe("Worker error diagnostics", () => {
  it("worker errors retain adapter identity and project remote errors deliberately", () => {
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
    const malformed = new Error("bad");
    Object.defineProperty(malformed, "name", { value: 42 });
    Object.defineProperty(malformed, "message", { value: 42 });
    assertEquals(remoteError(malformed).name, "Error");
    assertEquals(remoteError(malformed).message, "Remote error");
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
});
