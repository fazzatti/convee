import { pipe, plugin } from "@convee";
import { persistentWasm, wasm } from "@convee/wasm";
import { jcoBindings } from "@convee/wasm/jco";
import { abiBindings } from "@example/rust-abi/bindings.ts";
import type { Packet, Root } from "@example/rust-abi/generated/abi.d.ts";
// @deno-types="@example/rust-abi/generated/abi.d.ts"
import { instantiate } from "@example/rust-abi/generated/abi.js";
import { abiPacket } from "@test/wasm/abi-cases.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Observed<Fn extends (...args: never[]) => unknown> = [
  Parameters<Fn>,
  ReturnType<Fn>,
];
type Expected<Fn extends (...args: never[]) => unknown> = [
  Parameters<Fn>,
  Promise<ReturnType<Fn>>,
];
declare function exact<T extends true>(): T;

// Type-only consumer: never execute the deliberately invalid calls below.
function contracts() {
  const api = wasm({ bindings: abiBindings });
  const owner = persistentWasm({ bindings: abiBindings });
  // Keep each export literal: this tests exact call signatures and rejects any.
  // Record requires an assertion for every generated export after regeneration.
  const freshContracts: Record<keyof Root, true> = {
    echoScalarValue: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoScalarValue">>>,
        Expected<Root["echoScalarValue"]>
      >
    >(),
    inspectScalarValue: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"inspectScalarValue">>>,
        Expected<Root["inspectScalarValue"]>
      >
    >(),
    echoAligned: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoAligned">>>,
        Expected<Root["echoAligned"]>
      >
    >(),
    listAligned: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listAligned">>>,
        Expected<Root["listAligned"]>
      >
    >(),
    enum256: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"enum256">>>,
        Expected<Root["enum256"]>
      >
    >(),
    enum257: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"enum257">>>,
        Expected<Root["enum257"]>
      >
    >(),
    echoBool: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoBool">>>,
        Expected<Root["echoBool"]>
      >
    >(),
    echoU8: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoU8">>>,
        Expected<Root["echoU8"]>
      >
    >(),
    echoS8: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoS8">>>,
        Expected<Root["echoS8"]>
      >
    >(),
    echoU16: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoU16">>>,
        Expected<Root["echoU16"]>
      >
    >(),
    echoS16: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoS16">>>,
        Expected<Root["echoS16"]>
      >
    >(),
    echoU32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoU32">>>,
        Expected<Root["echoU32"]>
      >
    >(),
    echoS32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoS32">>>,
        Expected<Root["echoS32"]>
      >
    >(),
    echoU64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoU64">>>,
        Expected<Root["echoU64"]>
      >
    >(),
    echoS64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoS64">>>,
        Expected<Root["echoS64"]>
      >
    >(),
    echoF32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoF32">>>,
        Expected<Root["echoF32"]>
      >
    >(),
    echoF64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoF64">>>,
        Expected<Root["echoF64"]>
      >
    >(),
    echoChar: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoChar">>>,
        Expected<Root["echoChar"]>
      >
    >(),
    echoString: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoString">>>,
        Expected<Root["echoString"]>
      >
    >(),
    listBool: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listBool">>>,
        Expected<Root["listBool"]>
      >
    >(),
    listU8: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listU8">>>,
        Expected<Root["listU8"]>
      >
    >(),
    listS8: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listS8">>>,
        Expected<Root["listS8"]>
      >
    >(),
    listU16: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listU16">>>,
        Expected<Root["listU16"]>
      >
    >(),
    listS16: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listS16">>>,
        Expected<Root["listS16"]>
      >
    >(),
    listU32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listU32">>>,
        Expected<Root["listU32"]>
      >
    >(),
    listS32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listS32">>>,
        Expected<Root["listS32"]>
      >
    >(),
    listU64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listU64">>>,
        Expected<Root["listU64"]>
      >
    >(),
    listS64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listS64">>>,
        Expected<Root["listS64"]>
      >
    >(),
    listF32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listF32">>>,
        Expected<Root["listF32"]>
      >
    >(),
    listF64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listF64">>>,
        Expected<Root["listF64"]>
      >
    >(),
    listChar: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listChar">>>,
        Expected<Root["listChar"]>
      >
    >(),
    listString: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"listString">>>,
        Expected<Root["listString"]>
      >
    >(),
    flags1: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flags1">>>,
        Expected<Root["flags1"]>
      >
    >(),
    flags8: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flags8">>>,
        Expected<Root["flags8"]>
      >
    >(),
    flags9: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flags9">>>,
        Expected<Root["flags9"]>
      >
    >(),
    flags16: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flags16">>>,
        Expected<Root["flags16"]>
      >
    >(),
    flags17: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flags17">>>,
        Expected<Root["flags17"]>
      >
    >(),
    flags32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flags32">>>,
        Expected<Root["flags32"]>
      >
    >(),
    echoShade: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoShade">>>,
        Expected<Root["echoShade"]>
      >
    >(),
    echoChoice: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoChoice">>>,
        Expected<Root["echoChoice"]>
      >
    >(),
    echoPacket: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoPacket">>>,
        Expected<Root["echoPacket"]>
      >
    >(),
    inspectPacket: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"inspectPacket">>>,
        Expected<Root["inspectPacket"]>
      >
    >(),
    throughHost: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"throughHost">>>,
        Expected<Root["throughHost"]>
      >
    >(),
    echoTuple: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoTuple">>>,
        Expected<Root["echoTuple"]>
      >
    >(),
    echoNested: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoNested">>>,
        Expected<Root["echoNested"]>
      >
    >(),
    echoOption: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoOption">>>,
        Expected<Root["echoOption"]>
      >
    >(),
    echoResult: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoResult">>>,
        Expected<Root["echoResult"]>
      >
    >(),
    resultOk: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"resultOk">>>,
        Expected<Root["resultOk"]>
      >
    >(),
    resultErr: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"resultErr">>>,
        Expected<Root["resultErr"]>
      >
    >(),
    resultUnit: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"resultUnit">>>,
        Expected<Root["resultUnit"]>
      >
    >(),
    echoIdentifier: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"echoIdentifier">>>,
        Expected<Root["echoIdentifier"]>
      >
    >(),
    charCode: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"charCode">>>,
        Expected<Root["charCode"]>
      >
    >(),
    stringCodes: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"stringCodes">>>,
        Expected<Root["stringCodes"]>
      >
    >(),
    bitsF32: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"bitsF32">>>,
        Expected<Root["bitsF32"]>
      >
    >(),
    bitsF64: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"bitsF64">>>,
        Expected<Root["bitsF64"]>
      >
    >(),
    noArgs: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"noArgs">>>,
        Expected<Root["noArgs"]>
      >
    >(),
    noResult: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"noResult">>>,
        Expected<Root["noResult"]>
      >
    >(),
    flat16: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flat16">>>,
        Expected<Root["flat16"]>
      >
    >(),
    flat17: exact<
      Equal<
        Observed<ReturnType<typeof api.step<"flat17">>>,
        Expected<Root["flat17"]>
      >
    >(),
  };
  const persistentContracts: Record<keyof Root, true> = {
    echoScalarValue: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoScalarValue">>>,
        Expected<Root["echoScalarValue"]>
      >
    >(),
    inspectScalarValue: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"inspectScalarValue">>>,
        Expected<Root["inspectScalarValue"]>
      >
    >(),
    echoAligned: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoAligned">>>,
        Expected<Root["echoAligned"]>
      >
    >(),
    listAligned: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listAligned">>>,
        Expected<Root["listAligned"]>
      >
    >(),
    enum256: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"enum256">>>,
        Expected<Root["enum256"]>
      >
    >(),
    enum257: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"enum257">>>,
        Expected<Root["enum257"]>
      >
    >(),
    echoBool: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoBool">>>,
        Expected<Root["echoBool"]>
      >
    >(),
    echoU8: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoU8">>>,
        Expected<Root["echoU8"]>
      >
    >(),
    echoS8: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoS8">>>,
        Expected<Root["echoS8"]>
      >
    >(),
    echoU16: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoU16">>>,
        Expected<Root["echoU16"]>
      >
    >(),
    echoS16: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoS16">>>,
        Expected<Root["echoS16"]>
      >
    >(),
    echoU32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoU32">>>,
        Expected<Root["echoU32"]>
      >
    >(),
    echoS32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoS32">>>,
        Expected<Root["echoS32"]>
      >
    >(),
    echoU64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoU64">>>,
        Expected<Root["echoU64"]>
      >
    >(),
    echoS64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoS64">>>,
        Expected<Root["echoS64"]>
      >
    >(),
    echoF32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoF32">>>,
        Expected<Root["echoF32"]>
      >
    >(),
    echoF64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoF64">>>,
        Expected<Root["echoF64"]>
      >
    >(),
    echoChar: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoChar">>>,
        Expected<Root["echoChar"]>
      >
    >(),
    echoString: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoString">>>,
        Expected<Root["echoString"]>
      >
    >(),
    listBool: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listBool">>>,
        Expected<Root["listBool"]>
      >
    >(),
    listU8: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listU8">>>,
        Expected<Root["listU8"]>
      >
    >(),
    listS8: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listS8">>>,
        Expected<Root["listS8"]>
      >
    >(),
    listU16: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listU16">>>,
        Expected<Root["listU16"]>
      >
    >(),
    listS16: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listS16">>>,
        Expected<Root["listS16"]>
      >
    >(),
    listU32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listU32">>>,
        Expected<Root["listU32"]>
      >
    >(),
    listS32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listS32">>>,
        Expected<Root["listS32"]>
      >
    >(),
    listU64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listU64">>>,
        Expected<Root["listU64"]>
      >
    >(),
    listS64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listS64">>>,
        Expected<Root["listS64"]>
      >
    >(),
    listF32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listF32">>>,
        Expected<Root["listF32"]>
      >
    >(),
    listF64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listF64">>>,
        Expected<Root["listF64"]>
      >
    >(),
    listChar: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listChar">>>,
        Expected<Root["listChar"]>
      >
    >(),
    listString: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"listString">>>,
        Expected<Root["listString"]>
      >
    >(),
    flags1: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flags1">>>,
        Expected<Root["flags1"]>
      >
    >(),
    flags8: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flags8">>>,
        Expected<Root["flags8"]>
      >
    >(),
    flags9: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flags9">>>,
        Expected<Root["flags9"]>
      >
    >(),
    flags16: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flags16">>>,
        Expected<Root["flags16"]>
      >
    >(),
    flags17: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flags17">>>,
        Expected<Root["flags17"]>
      >
    >(),
    flags32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flags32">>>,
        Expected<Root["flags32"]>
      >
    >(),
    echoShade: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoShade">>>,
        Expected<Root["echoShade"]>
      >
    >(),
    echoChoice: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoChoice">>>,
        Expected<Root["echoChoice"]>
      >
    >(),
    echoPacket: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoPacket">>>,
        Expected<Root["echoPacket"]>
      >
    >(),
    inspectPacket: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"inspectPacket">>>,
        Expected<Root["inspectPacket"]>
      >
    >(),
    throughHost: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"throughHost">>>,
        Expected<Root["throughHost"]>
      >
    >(),
    echoTuple: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoTuple">>>,
        Expected<Root["echoTuple"]>
      >
    >(),
    echoNested: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoNested">>>,
        Expected<Root["echoNested"]>
      >
    >(),
    echoOption: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoOption">>>,
        Expected<Root["echoOption"]>
      >
    >(),
    echoResult: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoResult">>>,
        Expected<Root["echoResult"]>
      >
    >(),
    resultOk: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"resultOk">>>,
        Expected<Root["resultOk"]>
      >
    >(),
    resultErr: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"resultErr">>>,
        Expected<Root["resultErr"]>
      >
    >(),
    resultUnit: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"resultUnit">>>,
        Expected<Root["resultUnit"]>
      >
    >(),
    echoIdentifier: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"echoIdentifier">>>,
        Expected<Root["echoIdentifier"]>
      >
    >(),
    charCode: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"charCode">>>,
        Expected<Root["charCode"]>
      >
    >(),
    stringCodes: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"stringCodes">>>,
        Expected<Root["stringCodes"]>
      >
    >(),
    bitsF32: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"bitsF32">>>,
        Expected<Root["bitsF32"]>
      >
    >(),
    bitsF64: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"bitsF64">>>,
        Expected<Root["bitsF64"]>
      >
    >(),
    noArgs: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"noArgs">>>,
        Expected<Root["noArgs"]>
      >
    >(),
    noResult: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"noResult">>>,
        Expected<Root["noResult"]>
      >
    >(),
    flat16: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flat16">>>,
        Expected<Root["flat16"]>
      >
    >(),
    flat17: exact<
      Equal<
        Observed<ReturnType<typeof owner.step<"flat17">>>,
        Expected<Root["flat17"]>
      >
    >(),
  };
  const packet: Promise<Packet> = api.step("echoPacket")(abiPacket());
  const flags = api.step("flags32")({ b0: true, b31: false });
  const option = api.step("echoOption")({ tag: "some", val: undefined });
  const success: Promise<string | undefined> = api.step("echoResult")({
    tag: "ok",
    val: "ok",
  });
  const absent: Promise<void> = api.step("resultUnit")(false);
  const consume = pipe([
    api.step("echoPacket"),
    (value: Packet) => value.choices.length,
  ]);
  const count: Promise<number> = consume(abiPacket());
  owner.step("echoPacket").use(
    plugin.for<[Packet], Packet>()({
      output: (value) => ({ ...value, name: "changed" }),
    }),
  );
  // @ts-expect-error The generated export inventory determines valid step names.
  api.step("EchoPacket");
  // @ts-expect-error u64 values are bigint, even when a number fits exactly.
  api.step("echoU64")(1);
  // @ts-expect-error u32 values are number, not bigint.
  api.step("echoU32")(1n);
  // @ts-expect-error Generated numeric lists require the declared typed array.
  api.step("listU8")([1, 2]);
  // @ts-expect-error Big integer arrays cannot accept a floating-point array.
  api.step("listU64")(new Float64Array());
  // @ts-expect-error Wide list output retains bigint elements.
  const wrongList: Promise<Uint32Array> = api.step("listU64")(
    new BigUint64Array(),
  );
  // @ts-expect-error Non-numeric lists preserve their element type.
  api.step("listBool")([0]);
  // @ts-expect-error Nested list record fields preserve their types.
  api.step("echoNested")([[{ x: "1", label: "a" }]]);
  // @ts-expect-error Unknown flags are not silently accepted as named capabilities.
  api.step("flags32")({ b32: true });
  // @ts-expect-error Flag values are boolean.
  api.step("flags1")({ b0: 1 });
  // @ts-expect-error Enums are closed string unions.
  api.step("echoShade")("purple");
  // @ts-expect-error The 256-case enum stops at index 255.
  api.step("enum256")("c256");
  // @ts-expect-error The 257-case enum stops at index 256.
  api.step("enum257")("c257");
  // @ts-expect-error Discriminants remain linked to their payloads.
  api.step("echoChoice")({ tag: "number", val: "1" });
  // @ts-expect-error Required variant payloads cannot be omitted.
  api.step("echoChoice")({ tag: "points" });
  // @ts-expect-error Payload-free variants do not acquire an optional payload.
  api.step("echoChoice")({ tag: "none", val: 1 });
  // @ts-expect-error Scalar variants preserve their width's JS representation.
  api.step("echoScalarValue")({ tag: "s64-value", val: 1 });
  // @ts-expect-error Nested options require an outer discriminant.
  api.step("echoOption")(undefined);
  // @ts-expect-error Inner option payload is string or undefined, not another tag.
  api.step("echoOption")({ tag: "some", val: { tag: "none" } });
  // @ts-expect-error Nested results retain their declared error payload.
  api.step("echoResult")({ tag: "err", val: "wrong" });
  // @ts-expect-error Function Result success is unwrapped by generated Jco types.
  const wrongResult: Promise<{ tag: "ok"; val: string }> = success;
  // @ts-expect-error Every required record field must be present.
  api.step("echoPacket")({ name: "missing" });
  // @ts-expect-error Record fields are validated through nested aggregates.
  api.step("echoPacket")({ ...abiPacket(), pair: ["wrong", 0] });
  // @ts-expect-error Tuples retain ordered element types.
  api.step("echoTuple")(["a", 1n, true, new Uint16Array()]);
  // @ts-expect-error Fixed tuples cannot accept extra elements.
  api.step("echoTuple")([1n, "a", true, new Uint16Array(), 0]);
  // @ts-expect-error No-argument functions cannot acquire an input.
  api.step("noArgs")(0);
  // @ts-expect-error The indirect parameter ABI still requires all 17 inputs.
  api.step("flat17")(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
  // @ts-expect-error Plugins cannot silently replace an aggregate with a scalar.
  owner.step("echoPacket").use(plugin().onOutput(() => 0));
  // @ts-expect-error Void results cannot become an inferred string.
  const wrongVoid: Promise<string> = absent;
  jcoBindings({
    instantiate,
    modules: {},
    // @ts-expect-error Imported capabilities must return the generated aggregate.
    imports: () => ({ observe: { default: (_value: Packet) => 0 } }),
  });
  jcoBindings({
    instantiate,
    modules: {},
    // @ts-expect-error Imported capabilities must accept the generated aggregate.
    imports: () => ({ observe: { default: (_value: string) => abiPacket() } }),
  });
  void [
    freshContracts,
    persistentContracts,
    packet,
    flags,
    option,
    success,
    count,
    wrongList,
    wrongResult,
    wrongVoid,
  ];
}
void contracts;
