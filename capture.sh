#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact public preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an evidence directory outside the project}"
: "${RUNTIME_DIR:?RUNTIME_DIR must point to the OMGithub runtime}"

run_timed() {
  /usr/bin/time -p "$@"
}

PROJECT_DIR="$PROJECT_DIR" CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" run_timed node --input-type=module -e '
  import { resolve } from "node:path";
  const project = resolve(process.env.PROJECT_DIR);
  const output = resolve(process.env.CAPTURE_DIR);
  let url;
  try { url = new URL(process.env.CAPTURE_URL); }
  catch { throw new Error("CAPTURE_URL must be an absolute HTTP(S) URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("CAPTURE_URL must use HTTP or HTTPS.");
  if (output === project || output.startsWith(project + "/")) throw new Error("CAPTURE_DIR must be outside the project source tree.");
'

[[ -f "$RUNTIME_DIR/scripts/default-capture.mjs" ]] || { echo "Missing runtime browser capture helper: $RUNTIME_DIR/scripts/default-capture.mjs" >&2; exit 1; }
run_timed mkdir -p "$CAPTURE_DIR"
cd "$PROJECT_DIR"
# The runtime helper opens the exact URL in its own browser, waits for page load,
# fonts and visible content, saves desktop/mobile PNGs, and closes that browser.
# Strict mode treats browser-side application errors as rendering defects (exit 1).
CAPTURE_STRICT=1 run_timed node "$RUNTIME_DIR/scripts/default-capture.mjs"
