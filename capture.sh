#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact public preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence output directory}"

run_timed() {
  /usr/bin/time -p "$@"
}

export PROJECT_DIR
run_timed node --input-type=module -e '
  import { resolve } from "node:path";
  const value = process.env.CAPTURE_URL;
  let url;
  try { url = new URL(value); } catch { throw new Error("CAPTURE_URL must be an absolute HTTP(S) URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("CAPTURE_URL must use HTTP or HTTPS.");
  const project = resolve(process.env.PROJECT_DIR);
  const output = resolve(process.env.CAPTURE_DIR);
  if (output === project || output.startsWith(project + "/")) throw new Error("CAPTURE_DIR must be outside the project source tree.");
'

run_timed mkdir -p "$CAPTURE_DIR"
cd "$PROJECT_DIR"
: "${RUNTIME_DIR:?RUNTIME_DIR must point to the OMGithub runtime}"
# The capture helper waits for page rendering, saves desktop/mobile evidence,
# closes its own browser, and uses exit 75 for transient browser/navigation faults.
run_timed node "$PROJECT_DIR/.omgithub/scripts/default-capture.mjs"
