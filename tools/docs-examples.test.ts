import { assertEquals } from "@std/assert";
import { exampleCompilerOptions, readmeExamples } from "./docs-examples.ts";

Deno.test("README checker extracts both TypeScript fence names and source lines", () => {
  assertEquals(
    readmeExamples(
      '# Guide\n\n```ts\nimport { step } from "jsr:@fifo/convee";\n```\n\n```typescript\nconst value = 1;\n```\n',
    ),
    [
      { source: 'import { step } from "../../src/index.ts";\n', line: 4 },
      { source: "const value = 1;\n", line: 8 },
    ],
  );
});

Deno.test("README checker accepts CRLF and single-quoted package imports", () => {
  assertEquals(
    readmeExamples(
      "```ts\r\nimport { pipe } from 'jsr:@fifo/convee';\r\n```\r\n",
    ),
    [{ source: 'import { pipe } from "../../src/index.ts";\r\n', line: 2 }],
  );
});

Deno.test("README checker ignores non-TypeScript fences", () => {
  assertEquals(
    readmeExamples("```bash\ndeno add jsr:@fifo/convee\n```\n\nPlain prose."),
    [],
  );
});

Deno.test("README checker preserves imports from other packages", () => {
  assertEquals(
    readmeExamples('```ts\nimport { assert } from "jsr:@std/assert";\n```'),
    [{ source: 'import { assert } from "jsr:@std/assert";\n', line: 2 }],
  );
});

Deno.test("example configuration only relaxes unused teaching declarations", () => {
  const options = Object.freeze({
    strict: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
  });
  assertEquals(exampleCompilerOptions(options), {
    strict: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
  });
  assertEquals(options.noUnusedLocals, true);
  assertEquals(options.noUnusedParameters, true);
});

Deno.test("example configuration accepts a project without compiler overrides", () => {
  assertEquals(exampleCompilerOptions(), {
    noUnusedLocals: false,
    noUnusedParameters: false,
  });
});
