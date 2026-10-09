#!/bin/bash
# Double-click to start the workspace on macOS (also works on Linux from a terminal).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org and then run this again."
  read -r -p "Press Enter to close."
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Your Node.js is too old. Install the LTS version from https://nodejs.org and then run this again."
  read -r -p "Press Enter to close."
  exit 1
fi
echo "Starting Integral Workspace..."
exec node --disable-warning=ExperimentalWarning server.js --open
