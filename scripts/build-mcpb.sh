#!/bin/bash
set -e

# Build .mcpb Desktop Extension for Claude Desktop
# Usage: ./scripts/build-mcpb.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/mcpb-build"
MCPB_DIR="$PROJECT_DIR/mcpb"
OUTPUT="$PROJECT_DIR/simple-3d-modeling.mcpb"

echo "=== Building .mcpb Desktop Extension ==="

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/server"

# 1. Build TypeScript
echo "→ Compiling TypeScript..."
cd "$PROJECT_DIR"
npm run build

# 2. Copy compiled server code
echo "→ Copying server files..."
cp -r "$PROJECT_DIR/dist/"* "$BUILD_DIR/server/"

# 3. Install production dependencies into build dir
echo "→ Installing production dependencies..."
cp "$PROJECT_DIR/package.json" "$BUILD_DIR/server/package.json"
cd "$BUILD_DIR/server"
npm install --omit=dev --ignore-scripts=false
cd "$PROJECT_DIR"

# 4. Copy manifest
echo "→ Copying manifest..."
# Update version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
node -e "
const m = require('$MCPB_DIR/manifest.json');
m.version = '$VERSION';
process.stdout.write(JSON.stringify(m, null, 2));
" > "$BUILD_DIR/manifest.json"

# 5. Pack with mcpb CLI
echo "→ Packing .mcpb bundle..."
npx @anthropic-ai/mcpb pack "$BUILD_DIR" "$OUTPUT"

# 6. Clean up
rm -rf "$BUILD_DIR"

echo ""
echo "=== Done! ==="
echo "Output: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
echo ""
echo "To verify: npx @anthropic-ai/mcpb info $OUTPUT"
