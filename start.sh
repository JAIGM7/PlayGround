#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
export PORT

run_timed() {
  /usr/bin/time -p "$@"
}

[[ -f package.json ]] || { echo "Missing package.json in $PROJECT_DIR" >&2; exit 1; }
[[ -f index.html ]] || { echo "Missing index.html in $PROJECT_DIR" >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be numeric: $PORT" >&2; exit 1; }

run_timed mkdir -p "$OPENCODE_WEB_DIR"
run_timed npm install --no-audit --no-fund
run_timed npm run build

PROJECT_DIR="$PROJECT_DIR" OPENCODE_WEB_DIR="$OPENCODE_WEB_DIR" run_timed node --input-type=module -e '
  import { mkdirSync, writeFileSync } from "node:fs";
  import { resolve, join } from "node:path";
  const project = resolve(process.env.PROJECT_DIR);
  const metadataDir = resolve(process.env.OPENCODE_WEB_DIR);
  const directory = resolve(project, "dist");
  if (!directory.startsWith(project + "/")) throw new Error("Built output must stay inside PROJECT_DIR.");
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(join(metadataDir, "deployment-output.json"), JSON.stringify({ project, directory }, null, 2) + "\n");
'

# Keep the preview server in the foreground for the controller-owned app-server.
run_timed npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort
