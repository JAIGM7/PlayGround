#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
export PORT="${PORT:-3000}"
export OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
: "${RUNTIME_DIR:?RUNTIME_DIR must point to the OMGithub runtime}"

run_timed() {
  /usr/bin/time -p "$@"
}

run_timed mkdir -p "$OPENCODE_WEB_DIR"
run_timed node --input-type=module -e '
  import { existsSync, readFileSync } from "node:fs";
  import { join } from "node:path";
  const root = process.cwd();
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    const project = JSON.parse(readFileSync(pkg, "utf8"));
    if (!project.dependencies?.vite && !project.devDependencies?.vite) {
      throw new Error("Unsupported package project: package.json must declare Vite for a static build.");
    }
  } else if (!existsSync(join(root, "index.html"))) {
    throw new Error("No index.html or supported Vite project found in " + root);
  }
'

# The runtime installs Vite dependencies when needed, builds into dist, records
# deployment-output.json, then keeps its static preview server in the foreground.
run_timed node "$RUNTIME_DIR/scripts/default-start.mjs"
