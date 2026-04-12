#!/bin/bash
set -e

echo "=== Prepare Commit ==="
echo ""

# 1. Type check
echo "[1/4] Type checking..."
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7016\|TS7006" || true
echo "  Done."
echo ""

# 2. Run tests
echo "[2/4] Running tests..."
npx vitest run
echo ""

# 3. Update graphify knowledge graph
echo "[3/4] Updating knowledge graph..."
if command -v claude &> /dev/null; then
  claude -p "/graphify" --allowedTools "Bash,Read,Write,Glob,Grep,Agent" --no-input
  echo "  Done."
else
  echo "  Claude Code CLI not found — skipping graphify. Run /graphify manually."
fi
echo ""

# 4. Stage graphify output
echo "[4/4] Staging graphify output..."
if [ -d "graphify-out" ]; then
  git add graphify-out/
  echo "  Staged graphify-out/"
else
  echo "  No graphify-out/ directory found."
fi
echo ""

echo "=== Ready to commit ==="
