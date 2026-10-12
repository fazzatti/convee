import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parallel, persistentParallel } from "@convee/workers";
import document from "@example/rust-text/document.worker.ts";

describe("Real Rust inside Convee workers", () => {
  it("runs one intentional WASM step with independent worker capacity and ordered joins", async () => {
    const process = parallel({
      workers: { document: { worker: document, count: 2 } },
      split: ({ document }, texts: string[]) =>
        texts.map((text) => document.job(text)),
      join: (results) => results,
    });
    assertEquals(await process(["Hello Rust", "One two three"]), [
      { words: 2, title: "Hello Rust" },
      { words: 3, title: "One two three" },
    ]);
  });
  it("collects guest application failures and reuses persistent workers for subsequent calls", async () => {
    await using owner = persistentParallel({
      workers: { document: { worker: document, count: 1 } },
      mode: "collect",
      split: ({ document }, text: string) => [document.job(text)] as const,
      join: ([result]) => result,
    });
    await owner.ready();
    const error = await owner.step("");
    assertEquals(error.status, "rejected");
    const result = await owner.step("Still usable");
    assertEquals(result, {
      status: "fulfilled",
      value: { words: 2, title: "Still usable" },
    });
  });
});
