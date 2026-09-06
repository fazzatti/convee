export function mutationStatus(result: {
  passed: boolean;
  timedOut: boolean;
  output: string;
}): "timeout" | "survived" | "killed" | "invalid" {
  if (result.timedOut) return "timeout";
  if (result.passed) return "survived";
  const plain = stripAnsiCode(result.output);
  return /^FAILED \| .*\| [1-9]\d* failed(?: |$)/m.test(plain)
    ? "killed"
    : "invalid";
}
import { stripAnsiCode } from "std/fmt/colors.ts";
