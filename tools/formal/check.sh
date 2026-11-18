#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
toolchain="$PWD/.artifacts/formal/dafny-4.11.0"
compiler=tools/formal/node_modules/.bin/lsc
if [[ ! -x "$toolchain/dafny" || ! -x "$compiler" ]]; then
  echo "Install the pinned proof tools first: deno task formal:setup" >&2
  exit 1
fi
if ! grep -q '[^[:space:]]' LemmaScript-files.txt; then
  echo "Formal verification manifest is empty." >&2
  exit 1
fi
export PATH="$toolchain:$PATH"
"$compiler" check --backend=dafny --slow
deno task formal:audit
deno run --allow-read=LemmaScript-files.txt,verification --allow-write=.artifacts --allow-run=dafny tools/formal-domains.ts "$@"
for law in invocation pipe registrations context scheduling batch ownership; do
  [[ -f "test/formal/$law.dfy" ]] || { echo "Missing reviewed composition suite: $law" >&2; exit 1; }
done
for suite in test/formal/*.dfy; do
  dafny verify --unicode-char:false --allow-deprecation "$suite"
done
if [[ "${1:-}" == "--faults" ]]; then
  deno run --allow-read=src,lemmascript.json,.artifacts --allow-write=.artifacts --allow-run="$PWD/$compiler" tools/formal-faults.ts
fi
