//! Canonical ABI conformance guest: independent scalar and aggregate boundaries.
wit_bindgen::generate!();
struct Abi;
impl Guest for Abi {
    fn enum_256(value: Enum256) -> Enum256 {
        value
    }
    fn enum_257(value: Enum257) -> Enum257 {
        value
    }
    fn echo_scalar_value(value: ScalarValue) -> ScalarValue {
        value
    }
    fn inspect_scalar_value(value: ScalarValue) -> String {
        match value {
            ScalarValue::U32Value(v) => format!("u32:{v}"),
            ScalarValue::S32Value(v) => format!("s32:{v}"),
            ScalarValue::F32Value(v) => format!("f32:{:x}", v.to_bits()),
            ScalarValue::U64Value(v) => format!("u64:{v}"),
            ScalarValue::S64Value(v) => format!("s64:{v}"),
            ScalarValue::F64Value(v) => format!("f64:{:x}", v.to_bits()),
        }
    }
    fn echo_aligned(value: Aligned) -> Aligned {
        value
    }
    fn list_aligned(mut value: Vec<Aligned>) -> Vec<Aligned> {
        value.reverse();
        value
    }

    fn echo_bool(value: bool) -> bool {
        value
    }
    fn echo_u8(value: u8) -> u8 {
        value
    }
    fn echo_s8(value: i8) -> i8 {
        value
    }
    fn echo_u16(value: u16) -> u16 {
        value
    }
    fn echo_s16(value: i16) -> i16 {
        value
    }
    fn echo_u32(value: u32) -> u32 {
        value
    }
    fn echo_s32(value: i32) -> i32 {
        value
    }
    fn echo_u64(value: u64) -> u64 {
        value
    }
    fn echo_s64(value: i64) -> i64 {
        value
    }
    fn echo_f32(value: f32) -> f32 {
        value
    }
    fn echo_f64(value: f64) -> f64 {
        value
    }
    fn echo_char(value: char) -> char {
        value
    }
    fn echo_string(value: String) -> String {
        value
    }
    fn list_bool(mut value: Vec<bool>) -> Vec<bool> {
        value.reverse();
        value
    }
    fn list_u8(mut value: Vec<u8>) -> Vec<u8> {
        value.reverse();
        value
    }
    fn list_s8(mut value: Vec<i8>) -> Vec<i8> {
        value.reverse();
        value
    }
    fn list_u16(mut value: Vec<u16>) -> Vec<u16> {
        value.reverse();
        value
    }
    fn list_s16(mut value: Vec<i16>) -> Vec<i16> {
        value.reverse();
        value
    }
    fn list_u32(mut value: Vec<u32>) -> Vec<u32> {
        value.reverse();
        value
    }
    fn list_s32(mut value: Vec<i32>) -> Vec<i32> {
        value.reverse();
        value
    }
    fn list_u64(mut value: Vec<u64>) -> Vec<u64> {
        value.reverse();
        value
    }
    fn list_s64(mut value: Vec<i64>) -> Vec<i64> {
        value.reverse();
        value
    }
    fn list_f32(mut value: Vec<f32>) -> Vec<f32> {
        value.reverse();
        value
    }
    fn list_f64(mut value: Vec<f64>) -> Vec<f64> {
        value.reverse();
        value
    }
    fn list_char(mut value: Vec<char>) -> Vec<char> {
        value.reverse();
        value
    }
    fn list_string(mut value: Vec<String>) -> Vec<String> {
        value.reverse();
        value
    }
    fn flags_1(value: Flags1) -> Flags1 {
        value
    }
    fn flags_8(value: Flags8) -> Flags8 {
        value
    }
    fn flags_9(value: Flags9) -> Flags9 {
        value
    }
    fn flags_16(value: Flags16) -> Flags16 {
        value
    }
    fn flags_17(value: Flags17) -> Flags17 {
        value
    }
    fn flags_32(value: Flags32) -> Flags32 {
        value
    }
    fn echo_shade(value: Shade) -> Shade {
        value
    }
    fn echo_choice(value: Choice) -> Choice {
        value
    }
    fn echo_packet(value: Packet) -> Packet {
        value
    }
    fn inspect_packet(value: Packet) -> String {
        format!(
            "{}|{}|{}|{}:{}|{}|{}|{}",
            value.id,
            value.name,
            value.enabled,
            value.anchor.x,
            value.anchor.label,
            value.values.len(),
            value.choices.len(),
            value.bytes.iter().map(|v| u64::from(*v)).sum::<u64>()
        )
    }
    fn through_host(value: Packet) -> Packet {
        observe(&value)
    }
    fn echo_tuple(value: (i64, String, bool, Vec<u16>)) -> (i64, String, bool, Vec<u16>) {
        value
    }
    fn echo_nested(value: Vec<Vec<Point>>) -> Vec<Vec<Point>> {
        value
    }
    fn echo_option(value: Option<Option<String>>) -> Option<Option<String>> {
        value
    }
    fn echo_result(value: Result<Option<String>, Choice>) -> Result<Option<String>, Choice> {
        value
    }
    fn result_ok(fail: bool) -> Result<u32, ()> {
        if fail { Err(()) } else { Ok(42) }
    }
    fn result_err(fail: bool) -> Result<(), String> {
        if fail { Err("declared".into()) } else { Ok(()) }
    }
    fn result_unit(fail: bool) -> Result<(), ()> {
        if fail { Err(()) } else { Ok(()) }
    }
    fn echo_identifier(value: Identifier) -> Identifier {
        value
    }
    fn char_code(value: char) -> u32 {
        value as u32
    }
    fn string_codes(value: String) -> Vec<u32> {
        value.chars().map(|c| c as u32).collect()
    }
    fn bits_f32(value: f32) -> u32 {
        value.to_bits()
    }
    fn bits_f64(value: f64) -> u64 {
        value.to_bits()
    }
    fn no_args() -> String {
        "guest".into()
    }
    fn no_result() {}
    fn flat_16(
        a0: u32,
        a1: u32,
        a2: u32,
        a3: u32,
        a4: u32,
        a5: u32,
        a6: u32,
        a7: u32,
        a8: u32,
        a9: u32,
        a10: u32,
        a11: u32,
        a12: u32,
        a13: u32,
        a14: u32,
        a15: u32,
    ) -> u32 {
        a0 * 1
            + a1 * 2
            + a2 * 3
            + a3 * 4
            + a4 * 5
            + a5 * 6
            + a6 * 7
            + a7 * 8
            + a8 * 9
            + a9 * 10
            + a10 * 11
            + a11 * 12
            + a12 * 13
            + a13 * 14
            + a14 * 15
            + a15 * 16
    }
    fn flat_17(
        a0: u32,
        a1: u32,
        a2: u32,
        a3: u32,
        a4: u32,
        a5: u32,
        a6: u32,
        a7: u32,
        a8: u32,
        a9: u32,
        a10: u32,
        a11: u32,
        a12: u32,
        a13: u32,
        a14: u32,
        a15: u32,
        a16: u32,
    ) -> u32 {
        a0 * 1
            + a1 * 2
            + a2 * 3
            + a3 * 4
            + a4 * 5
            + a5 * 6
            + a6 * 7
            + a7 * 8
            + a8 * 9
            + a9 * 10
            + a10 * 11
            + a11 * 12
            + a12 * 13
            + a13 * 14
            + a14 * 15
            + a15 * 16
            + a16 * 17
    }
}
export!(Abi);
