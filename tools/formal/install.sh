#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npm ci --prefix tools/formal --ignore-scripts --no-audit --no-fund
version=4.11.0
destination=".artifacts/formal/dafny-$version"
case "$(uname -sm)" in
  "Darwin arm64") platform=arm64-macos-13; digest=c90c75e7d5db9c6ccbb7127840dfe43f0ac938b039a7ebed146d8ead383a572f ;;
  "Darwin x86_64") platform=x64-macos-13; digest=5fc0de946c5b2fad33f16bd22a5b06f4fd0dfa7f6d770284237e3f1f3ca9f73d ;;
  "Linux x86_64") platform=x64-ubuntu-22.04; digest=a46a9ff7cdd720f7955854c78e95df13f4cfe6b80691b05f8654fe19e8267179 ;;
  *) echo "Automated Dafny installation supports macOS arm64/x64 and Linux x64." >&2; exit 1 ;;
esac
if [[ ! -x "$destination/dafny" ]]; then
  mkdir -p .artifacts/formal
  scratch=$(mktemp -d .artifacts/formal/install.XXXXXXXX)
  trap 'rm -rf "$scratch"' EXIT
  archive="dafny-$version-$platform.zip"
  curl --fail --location --retry 2 --silent --show-error "https://github.com/dafny-lang/dafny/releases/download/v$version/$archive" -o "$scratch/dafny.zip"
  (cd "$scratch" && echo "$digest  dafny.zip" | shasum -a 256 -c -)
  unzip -q "$scratch/dafny.zip" -d "$scratch"
  mv "$scratch/dafny" "$destination"
fi
"$destination/dafny" --version
tools/formal/node_modules/.bin/lsc version
