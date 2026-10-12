import type { WasmResource } from "@convee/wasm";
import profile from "@test/fixtures/wasm-abi-profile.json" with {
  type: "json",
};
import type {
  Aligned,
  Enum256,
  Enum257,
  Packet,
  Root,
  ScalarValue,
} from "@example/rust-abi/generated/abi.d.ts";

/** One portable, named contract assertion against the real generated Rust guest. */
export interface AbiCase {
  readonly id: string;
  readonly run: (api: WasmResource<Root>) => Promise<void>;
}

/**
 * Compare ABI-owned values, retaining NaN, signed zero and typed-array identity.
 * @param actual - Result produced by the tested boundary.
 * @param expected - Independent value or transformation expected by the contract.
 * @returns Nothing when the complete value agrees.
 * @throws Error naming the first mismatched property or array element.
 */
export function abiEqual(
  actual: unknown,
  expected: unknown,
  path = "result",
): void {
  if (Object.is(actual, expected)) return;
  if (
    !actual || !expected || typeof actual !== "object" ||
    typeof expected !== "object"
  ) {
    throw new Error(
      `${path}: ${String(actual)} differs from ${String(expected)}`,
    );
  }
  if (
    Object.getPrototypeOf(actual).constructor !==
      Object.getPrototypeOf(expected).constructor
  ) {
    throw new Error(path + ": different value constructors");
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    abiEqual(actual.length, expected.length, path + ".length");
  }
  const keys = Object.keys(actual).sort(),
    required = Object.keys(expected).sort();
  if (
    keys.length !== required.length ||
    keys.some((key, i) => key !== required[i])
  ) {
    throw new Error(path + ": different fields or length");
  }
  for (const key of keys) {
    abiEqual(
      Reflect.get(actual, key),
      Reflect.get(expected, key),
      path + "." + key,
    );
  }
}

/**
 * Build a distinguishable aggregate that exercises indirect lowering and lifting.
 * @returns A new owned packet containing nested variants, options, results and buffers.
 * @throws No intentional errors.
 */
export function abiPacket(): Packet {
  return {
    id: 18446744073709551615n,
    name: "A\0🌍",
    enabled: true,
    anchor: { x: -123, label: "anchor" },
    values: [{ x: 1, label: "first" }, { x: -2, label: "second" }],
    choices: [{ tag: "none" }, { tag: "number", val: -9223372036854775808n }, {
      tag: "text",
      val: "variant",
    }, { tag: "points", val: [{ x: 7, label: "nested" }] }],
    optional: { tag: "some", val: undefined },
    verdicts: [{ tag: "ok", val: 4294967295 }, { tag: "err", val: "failure" }],
    pair: [-0, "tuple"],
    shade: "blue",
    bytes: new Uint8Array([0, 128, 255]),
  };
}

async function domain(
  run: () => Promise<unknown>,
  expected: unknown,
): Promise<void> {
  let caught = false;
  try {
    await run();
  } catch (error) {
    caught = true;
    abiEqual(Reflect.get(Object(error), "code"), "WASM_APPLICATION");
    abiEqual(Reflect.get(Object(error), "cause"), expected);
  }
  if (!caught) throw new Error("Expected declared guest Result failure");
}

const integers = [
  ["u8", "echoU8", [0, 1, 127, 128, 255]],
  ["s8", "echoS8", [-128, -127, -1, 0, 1, 127]],
  ["u16", "echoU16", [0, 1, 255, 256, 32768, 65535]],
  ["s16", "echoS16", [-32768, -32767, -1, 0, 1, 32767]],
  ["u32", "echoU32", [0, 1, 65536, 2147483648, 4294967295]],
  ["s32", "echoS32", [-2147483648, -2147483647, -1, 0, 1, 2147483647]],
] as const;
const wide = [
  ["u64", "echoU64", [
    0n,
    1n,
    9007199254740991n,
    9007199254740992n,
    9007199254740993n,
    18446744073709551615n,
  ]],
  ["s64", "echoS64", [
    -9223372036854775808n,
    -9007199254740993n,
    -1n,
    0n,
    1n,
    9007199254740993n,
    9223372036854775807n,
  ]],
] as const;
const chars = [
  "\0",
  "\u007f",
  "\u0080",
  "\u07ff",
  "\u0800",
  "\ud7ff",
  "\ue000",
  "\uffff",
  "🌍",
  "\u{10ffff}",
];
const strings = [
  "",
  "\0",
  "a\0b",
  "Olá 世界 🌍",
  "e\u0301",
  "\ufeffstart",
  "x".repeat(65536),
];

/**
 * Portable ABI conformance cases shared by BDD suites and isolated runtime consumers.
 * They call actual Rust exports and assert values, representation and ownership.
 * Declared Result failures are classified only by the fixture-specific bindings.
 * Rejections and traps outside that contract fail the case.
 */
export const abiCases: readonly AbiCase[] = [
  {
    id: "enum-discriminant-width",
    async run(api) {
      for (let i = 0; i < 256; i++) {
        abiEqual(
          await api.step("enum256")(("c" + i) as Enum256),
          "c" + i,
        );
      }
      for (let i = 0; i < 257; i++) {
        abiEqual(
          await api.step("enum257")(("c" + i) as Enum257),
          "c" + i,
        );
      }
    },
  },
  {
    id: "variant-flat-joins",
    async run(api) {
      const values: [ScalarValue, string][] = [
        [{ tag: "u32-value", val: 4294967295 }, "u32:4294967295"],
        [{ tag: "s32-value", val: -2147483648 }, "s32:-2147483648"],
        [{ tag: "f32-value", val: -0 }, "f32:80000000"],
        [{ tag: "f32-value", val: 1 }, "f32:3f800000"],
        [
          { tag: "u64-value", val: 18446744073709551615n },
          "u64:18446744073709551615",
        ],
        [
          { tag: "s64-value", val: -9223372036854775808n },
          "s64:-9223372036854775808",
        ],
        [{ tag: "f64-value", val: -0 }, "f64:8000000000000000"],
        [{ tag: "f64-value", val: 1 }, "f64:3ff0000000000000"],
      ];
      for (const [value, expected] of values) {
        abiEqual(await api.step("echoScalarValue")(value), value);
        abiEqual(await api.step("inspectScalarValue")(value), expected);
      }
    },
  },
  {
    id: "record-alignment",
    async run(api) {
      const value: Aligned = {
        a: 255,
        b: 18446744073709551615n,
        c: 65535,
        d: -2147483648,
        e: -0,
        f: -128,
        g: Number.MIN_VALUE,
        h: -32768,
        enabled: true,
      };
      abiEqual(await api.step("echoAligned")(value), value);
      const second: Aligned = {
        a: 0,
        b: 1n,
        c: 1,
        d: 2147483647,
        e: Math.fround(1 / 3),
        f: 127,
        g: Infinity,
        h: 32767,
        enabled: false,
      };
      abiEqual(await api.step("listAligned")([value, second]), [second, value]);
      abiEqual(await api.step("listAligned")([]), []);
    },
  },
  ...integers.map(([id, name, values]): AbiCase => ({
    id: "scalar-" + id,
    async run(api) {
      for (const value of values) abiEqual(await api.step(name)(value), value);
    },
  })),
  ...wide.map(([id, name, values]): AbiCase => ({
    id: "scalar-" + id,
    async run(api) {
      for (const value of values) abiEqual(await api.step(name)(value), value);
    },
  })),
  {
    id: "scalar-bool",
    async run(api) {
      for (const value of [false, true]) {
        abiEqual(
          await api.step("echoBool")(value),
          value,
        );
      }
    },
  },
  {
    id: "scalar-f32",
    async run(api) {
      for (
        const value of [
          0,
          -0,
          1,
          -1,
          1 / 3,
          2 ** -149,
          2 ** -126,
          3.4028234663852886e38,
          Infinity,
          -Infinity,
          NaN,
        ]
      ) {
        abiEqual(await api.step("echoF32")(value), Math.fround(value));
      }
      for (
        const [value, bits] of [[0, 0], [-0, 0x80000000], [1, 0x3f800000], [
          2 ** -149,
          1,
        ], [Infinity, 0x7f800000]] as const
      ) {
        abiEqual(await api.step("bitsF32")(value), bits);
      }
    },
  },
  {
    id: "scalar-f64",
    async run(api) {
      for (
        const value of [
          0,
          -0,
          1 / 3,
          Number.MIN_VALUE,
          Number.MAX_VALUE,
          Number.MIN_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER,
          Infinity,
          -Infinity,
          NaN,
        ]
      ) {
        abiEqual(await api.step("echoF64")(value), value);
      }
      for (
        const [value, bits] of [
          [0, 0n],
          [-0, 0x8000000000000000n],
          [1, 0x3ff0000000000000n],
          [Number.MIN_VALUE, 1n],
          [Infinity, 0x7ff0000000000000n],
        ] as const
      ) {
        abiEqual(await api.step("bitsF64")(value), bits);
      }
    },
  },
  {
    id: "scalar-char",
    async run(api) {
      for (const value of chars) {
        abiEqual(await api.step("echoChar")(value), value);
        abiEqual(await api.step("charCode")(value), value.codePointAt(0));
      }
    },
  },
  {
    id: "scalar-string",
    async run(api) {
      for (const value of strings) {
        abiEqual(await api.step("echoString")(value), value);
        abiEqual(
          await api.step("stringCodes")(value),
          Uint32Array.from([...value].map((char) => char.codePointAt(0)!)),
        );
      }
      abiEqual(await api.step("echoString")("\ud800x\udfff"), "\ufffdx\ufffd");
    },
  },
  {
    id: "exhaustive-u8",
    async run(api) {
      for (let value = 0; value < 256; value++) {
        abiEqual(
          await api.step("echoU8")(value),
          value,
        );
      }
    },
  },
  {
    id: "exhaustive-s8",
    async run(api) {
      for (let value = -128; value < 128; value++) {
        abiEqual(
          await api.step("echoS8")(value),
          value,
        );
      }
    },
  },
  // Numeric list cases keep each generated typed-array contract compiler-checked.
  {
    id: "list-u8",
    async run(api) {
      const padded = new Uint8Array([9, 0, 1, 127, 128, 255, 9]);
      for (
        const value of [
          new Uint8Array(),
          new Uint8Array([0, 1, 127, 128, 255]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listU8")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-s8",
    async run(api) {
      const padded = new Int8Array([9, -128, -1, 0, 1, 127, 9]);
      for (
        const value of [
          new Int8Array(),
          new Int8Array([-128, -1, 0, 1, 127]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listS8")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-u16",
    async run(api) {
      const padded = new Uint16Array([9, 0, 255, 256, 65535, 9]);
      for (
        const value of [
          new Uint16Array(),
          new Uint16Array([0, 255, 256, 65535]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listU16")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-s16",
    async run(api) {
      const padded = new Int16Array([9, -32768, -1, 0, 32767, 9]);
      for (
        const value of [
          new Int16Array(),
          new Int16Array([-32768, -1, 0, 32767]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listS16")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-u32",
    async run(api) {
      const padded = new Uint32Array([9, 0, 65536, 2147483648, 4294967295, 9]);
      for (
        const value of [
          new Uint32Array(),
          new Uint32Array([0, 65536, 2147483648, 4294967295]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listU32")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-s32",
    async run(api) {
      const padded = new Int32Array([9, -2147483648, -1, 0, 2147483647, 9]);
      for (
        const value of [
          new Int32Array(),
          new Int32Array([-2147483648, -1, 0, 2147483647]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listS32")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-u64",
    async run(api) {
      const padded = new BigUint64Array([
        9n,
        0n,
        9007199254740993n,
        18446744073709551615n,
        9n,
      ]);
      for (
        const value of [
          new BigUint64Array(),
          new BigUint64Array([0n, 9007199254740993n, 18446744073709551615n]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listU64")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-s64",
    async run(api) {
      const padded = new BigInt64Array([
        9n,
        -9223372036854775808n,
        -1n,
        0n,
        9223372036854775807n,
        9n,
      ]);
      for (
        const value of [
          new BigInt64Array(),
          new BigInt64Array([
            -9223372036854775808n,
            -1n,
            0n,
            9223372036854775807n,
          ]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listS64")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-f32",
    async run(api) {
      const padded = new Float32Array([
        9,
        0,
        -0,
        1 / 3,
        2 ** -149,
        Infinity,
        -Infinity,
        NaN,
        9,
      ]);
      for (
        const value of [
          new Float32Array(),
          new Float32Array([0, -0, 1 / 3, 2 ** -149, Infinity, -Infinity, NaN]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listF32")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-f64",
    async run(api) {
      const padded = new Float64Array([
        9,
        0,
        -0,
        1 / 3,
        Number.MIN_VALUE,
        Number.MAX_VALUE,
        Infinity,
        -Infinity,
        NaN,
        9,
      ]);
      for (
        const value of [
          new Float64Array(),
          new Float64Array([
            0,
            -0,
            1 / 3,
            Number.MIN_VALUE,
            Number.MAX_VALUE,
            Infinity,
            -Infinity,
            NaN,
          ]),
          padded.subarray(1, padded.length - 1),
        ]
      ) {
        const before = value.slice();
        abiEqual(await api.step("listF64")(value), before.slice().reverse());
        abiEqual(value, before);
      }
    },
  },
  {
    id: "list-bool",
    async run(api) {
      for (const value of [[], [true, false, true, true]]) {
        abiEqual(
          await api.step("listBool")(value),
          [...value].reverse(),
        );
      }
    },
  },
  {
    id: "list-char",
    async run(api) {
      for (const value of [[], chars]) {
        abiEqual(
          await api.step("listChar")(value),
          [...value].reverse(),
        );
      }
    },
  },
  {
    id: "list-string",
    async run(api) {
      for (const value of [[], strings]) {
        abiEqual(
          await api.step("listString")(value),
          [...value].reverse(),
        );
      }
    },
  },
  ...([1, 8, 9, 16, 17, 32] as const).map((width): AbiCase => ({
    id: "flags-" + width,
    async run(api) {
      const invoke = api.step(`flags${width}`);
      const masks = width === 8 ? Array.from({ length: 256 }, (_, n) => n) : [
        0,
        2 ** width - 1,
        ...Array.from({ length: width }, (_, n) => 2 ** n),
      ];
      for (const mask of masks) {
        const value = Object.fromEntries(
          Array.from(
            { length: width },
            (_, n) => ["b" + n, Math.floor(mask / 2 ** n) % 2 === 1],
          ),
        );
        abiEqual(await invoke(value), value);
      }
      abiEqual(
        await invoke({}),
        Object.fromEntries(
          Array.from({ length: width }, (_, n) => ["b" + n, false]),
        ),
      );
    },
  })),
  {
    id: "enum",
    async run(api) {
      for (const value of ["red", "green", "blue"] as const) {
        abiEqual(
          await api.step("echoShade")(value),
          value,
        );
      }
    },
  },
  {
    id: "variant",
    async run(api) {
      for (const value of abiPacket().choices) {
        abiEqual(
          await api.step("echoChoice")(value),
          value,
        );
      }
    },
  },
  {
    id: "record",
    async run(api) {
      const value = abiPacket();
      abiEqual(await api.step("echoPacket")(value), value);
      // Rust derives these observations from individual fields, independently of lifting.
      abiEqual(
        await api.step("inspectPacket")(value),
        "18446744073709551615|A\0🌍|true|-123:anchor|2|4|383",
      );
    },
  },
  {
    id: "tuple",
    async run(api) {
      const value: [bigint, string, boolean, Uint16Array] = [
        -9223372036854775808n,
        "tuple",
        true,
        new Uint16Array([0, 256, 65535]),
      ];
      abiEqual(await api.step("echoTuple")(value), value);
    },
  },
  {
    id: "nested-list",
    async run(api) {
      for (
        const value of [[], [[], [{ x: 1, label: "one" }], abiPacket().values]]
      ) abiEqual(await api.step("echoNested")(value), value);
    },
  },
  {
    id: "nested-option",
    async run(api) {
      for (
        const value of [{ tag: "none" }, { tag: "some", val: undefined }, {
          tag: "some",
          val: "",
        }, { tag: "some", val: "present" }] as const
      ) {
        abiEqual(await api.step("echoOption")(value), value);
      }
    },
  },
  {
    id: "result-payloads",
    async run(api) {
      for (const value of [undefined, "", "present"]) {
        abiEqual(
          await api.step("echoResult")({ tag: "ok", val: value }),
          value,
        );
      }
      for (const value of abiPacket().choices) {
        await domain(
          () => api.step("echoResult")({ tag: "err", val: value }),
          value,
        );
      }
    },
  },
  {
    id: "result-ok-only",
    async run(api) {
      abiEqual(await api.step("resultOk")(false), 42);
      await domain(() => api.step("resultOk")(true), undefined);
    },
  },
  {
    id: "result-err-only",
    async run(api) {
      abiEqual(await api.step("resultErr")(false), undefined);
      await domain(() => api.step("resultErr")(true), "declared");
    },
  },
  {
    id: "result-unit",
    async run(api) {
      abiEqual(await api.step("resultUnit")(false), undefined);
      await domain(() => api.step("resultUnit")(true), undefined);
    },
  },
  {
    id: "alias",
    async run(api) {
      abiEqual(
        await api.step("echoIdentifier")(9007199254740993n),
        9007199254740993n,
      );
    },
  },
  {
    id: "empty-signatures",
    async run(api) {
      abiEqual(await api.step("noArgs")(), "guest");
      abiEqual(await api.step("noResult")(), undefined);
    },
  },
  {
    id: "flat-16",
    async run(api) {
      abiEqual(
        await api.step("flat16")(
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
        ),
        1496,
      );
    },
  },
  {
    id: "flat-17",
    async run(api) {
      abiEqual(
        await api.step("flat17")(
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
        ),
        1785,
      );
    },
  },
  {
    id: "host-aggregate",
    async run(api) {
      const value = abiPacket();
      abiEqual(await api.step("throughHost")(value), {
        ...value,
        name: "host:" + value.name,
      });
    },
  },
  {
    id: "ownership-growth",
    async run(api) {
      const value = abiPacket(), before = structuredClone(value);
      const result = await api.step("echoPacket")(value);
      value.bytes.fill(17);
      value.values[0].label = "caller mutation";
      await api.step("listU8")(new Uint8Array(2_000_000).fill(4));
      abiEqual(result, before);
      result.bytes.fill(27);
      abiEqual(await api.step("echoPacket")(before), before);
    },
  },
  {
    id: "seeded-aggregates",
    async run(api) {
      let seed = 0x13579bdf;
      const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      for (let n = 0; n < 128; n++) {
        const value = abiPacket();
        value.id = (BigInt(next()) << 32n) | BigInt(next());
        value.name = strings[next() % (strings.length - 1)];
        value.enabled = next() % 2 === 0;
        value.anchor.x = next() | 0;
        value.values = Array.from(
          { length: next() % 8 },
          () => ({ x: next() | 0, label: chars[next() % chars.length] }),
        );
        value.choices = value.choices.slice(0, next() % 5);
        value.bytes = Uint8Array.from(
          { length: next() % 64 },
          () => next() & 255,
        );
        value.optional = next() % 2
          ? { tag: "none" }
          : { tag: "some", val: n % 2 ? undefined : value.name };
        abiEqual(await api.step("echoPacket")(value), value);
      }
    },
  },
  {
    id: "javascript-coercions",
    async run(api) {
      // The pinned generated ABI performs these conversions; Convee preserves them.
      const samples: [keyof Root, unknown, unknown][] = [
        ["echoU8", 256, 0],
        ["echoU8", -1, 255],
        ["echoS8", 128, -128],
        ["echoU16", 65536, 0],
        ["echoS16", 32768, -32768],
        ["echoU32", -1, 4294967295],
        ["echoS32", 2147483648, -2147483648],
        ["echoU8", 1.9, 1],
        ["echoU8", NaN, 0],
        ["echoU8", Infinity, 0],
        ["echoU64", -1n, 18446744073709551615n],
        ["echoS64", 9223372036854775808n, -9223372036854775808n],
        ["echoBool", "yes", true],
        ["echoBool", 0, false],
        ["echoChar", "ab", "a"],
        ["echoChar", "", "\0"],
        ["listU16", [0, 65535], new Uint16Array([65535, 0])],
      ];
      for (const [name, input, expected] of samples) {
        abiEqual(
          await Reflect.apply(api.step(name), undefined, [input]),
          expected,
        );
      }
    },
  },
  {
    id: "invalid-javascript-inputs",
    async run(api) {
      // Deliberately bypass TS to exercise actual lowering/validation failures.
      const samples: [keyof Root, unknown, string][] = [
        ["echoU8", Symbol("invalid"), "TypeError"],
        ["echoS8", 1n, "TypeError"],
        ["echoU64", 1.5, "RangeError"],
        ["echoS64", NaN, "RangeError"],
        ["echoString", 12, "TypeError"],
        ["echoChar", 12, "TypeError"],
        ["echoShade", "purple", "TypeError"],
        ["echoChoice", { tag: "absent" }, "TypeError"],
        [
          "echoChoice",
          { tag: "points", val: [{ x: 1, label: 42 }] },
          "TypeError",
        ],
        ["echoOption", null, "TypeError"],
        ["echoResult", { tag: "absent" }, "TypeError"],
        ["echoTuple", null, "TypeError"],
        ["echoPacket", {}, "TypeError"],
        ["listU8", [-1, 256], "TypeError"],
        ["listU16", [NaN], "TypeError"],
        ["listU64", [1], "TypeError"],
        ["listString", [1], "TypeError"],
        ["flags8", 1, "TypeError"],
      ];
      for (const [name, input, expected] of samples) {
        let caught = false;
        try {
          await Reflect.apply(api.step(name), undefined, [input]);
        } catch (error) {
          caught = true;
          abiEqual(Reflect.get(Object(error), "name"), expected, name);
        }
        if (!caught) throw new Error(name + ": invalid JS input was accepted");
        abiEqual(await api.step("noArgs")(), "guest");
      }
    },
  },
];

/**
 * Run every registered ABI case and record the generated exports actually selected.
 * @param api - Ordinary or persistent WASM resource using the real ABI fixture.
 * @returns Case IDs and export names, for runtime reports and inventory checks.
 * @throws The first consumer assertion or unexpected ABI failure.
 */
export async function runAbiMatrix(
  api: WasmResource<Root>,
): Promise<{ cases: string[]; exports: string[] }> {
  abiEqual(abiCases.map((item) => item.id).sort(), profile.cases);
  const selected = new Set<string>();
  const subject: WasmResource<Root> = {
    preload: () => api.preload(),
    step(name, options) {
      selected.add(name);
      return api.step(name, options);
    },
  };
  for (const item of abiCases) await item.run(subject);
  return {
    cases: abiCases.map((item) => item.id),
    exports: [...selected].sort(),
  };
}
