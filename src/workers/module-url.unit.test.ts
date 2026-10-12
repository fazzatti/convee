import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { moduleUrl } from "@/workers/module-url.ts";

describe("worker runtime module URLs", () => {
  it("preserves TypeScript for source consumers and JavaScript for installed consumers", () => {
    assertEquals(
      moduleUrl("entry", "file:///package/pool.ts").href,
      "file:///package/entry.ts",
    );
    assertEquals(
      moduleUrl("entry", "file:///package/pool.js").href,
      "file:///package/entry.js",
    );
    assertEquals(
      moduleUrl("bootstrap", "https://example.com/vite.js?cache=.ts").href,
      "https://example.com/bootstrap.js",
    );
    assertEquals(
      moduleUrl("bootstrap", "file:///a%20b/vite.ts?cache=.js").href,
      "file:///a%20b/bootstrap.ts",
    );
  });
});
