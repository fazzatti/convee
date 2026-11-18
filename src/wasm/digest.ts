/** Encode each SHA-256 byte as two lowercase hexadecimal digits, including leading zeroes. */
export function hexByte(value: number): string {
  //@ verify
  //@ requires 0 <= value && value <= 255
  //@ ensures \result.length === 2
  //@ ensures \result.slice(0, 1) === "0123456789abcdef".slice(Math.floor(value / 16), Math.floor(value / 16) + 1)
  //@ ensures \result.slice(1) === "0123456789abcdef".slice(value % 16, value % 16 + 1)
  const digits = "0123456789abcdef";
  const high = Math.floor(value / 16);
  const low = value % 16;
  return digits.slice(high, high + 1) + digits.slice(low, low + 1);
}
