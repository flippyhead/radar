#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/bump-version.sh <plugin> <version>
# Example: ./scripts/bump-version.sh radar 3.1.0
#          ./scripts/bump-version.sh open-brain 2.1.0
#
# Updates the version in:
#   1. plugins/<plugin>/.claude-plugin/plugin.json
#   2. .claude-plugin/marketplace.json (for the matching plugin entry)
#   3. .claude-plugin/plugin.json (root — set to the highest plugin version)

PLUGIN="${1:?Usage: bump-version.sh <plugin> <version>}"
VERSION="${2:?Usage: bump-version.sh <plugin> <version>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 1. Per-plugin plugin.json
PLUGIN_JSON="$REPO_ROOT/plugins/$PLUGIN/.claude-plugin/plugin.json"
if [ ! -f "$PLUGIN_JSON" ]; then
  echo "Error: $PLUGIN_JSON not found" >&2
  exit 1
fi

node -e "
const fs = require('fs');
const path = '$PLUGIN_JSON';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
data.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
"
echo "Updated $PLUGIN_JSON → $VERSION"

# 2. Marketplace entry
MARKETPLACE_JSON="$REPO_ROOT/.claude-plugin/marketplace.json"
node -e "
const fs = require('fs');
const path = '$MARKETPLACE_JSON';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
const plugin = data.plugins.find(p => p.name === '$PLUGIN');
if (!plugin) { console.error('Plugin $PLUGIN not found in marketplace.json'); process.exit(1); }
plugin.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
"
echo "Updated $MARKETPLACE_JSON ($PLUGIN) → $VERSION"

# 3. Root plugin.json — set to highest version across all plugins
ROOT_JSON="$REPO_ROOT/.claude-plugin/plugin.json"
node -e "
const fs = require('fs');
const mp = JSON.parse(fs.readFileSync('$MARKETPLACE_JSON', 'utf-8'));
const versions = mp.plugins.map(p => p.version);
const highest = versions.sort((a, b) => {
  const [a1,a2,a3] = a.split('.').map(Number);
  const [b1,b2,b3] = b.split('.').map(Number);
  return (b1-a1) || (b2-a2) || (b3-a3);
})[0];
const root = JSON.parse(fs.readFileSync('$ROOT_JSON', 'utf-8'));
root.version = highest;
fs.writeFileSync('$ROOT_JSON', JSON.stringify(root, null, 2) + '\n');
console.log('Updated ' + '$ROOT_JSON' + ' → ' + highest);
"

echo "Done. Run 'git diff' to verify."
