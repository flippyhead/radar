# Radar Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename and restructure the claude-workflow-analyst repo into "radar" — two plugins (radar + open-brain) with clearer naming, brain-optional architecture, reliability fixes, and a polished public face.

**Architecture:** The repo ships two plugins from one marketplace listing. The `plugins/workflow-analyst/` directory becomes `plugins/radar/` with renamed skills (radar-analyze, radar-scan, radar-recommend, radar). Open-brain plugin stays structurally similar but gets a simplified hook and v2.0.0 bump. All SKILL.md files are updated for brain-optional messaging and internal cross-references.

**Tech Stack:** Claude Code plugin system (SKILL.md, plugin.json, marketplace.json, hooks.json), Node.js ESM (hooks), MCP HTTP (Open Brain)

**Spec:** `docs/superpowers/specs/2026-03-26-radar-rebrand-design.md`

---

### Task 1: Rename plugin directory and config files

**Files:**
- Move: `plugins/workflow-analyst/` → `plugins/radar/`
- Modify: `plugins/radar/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Move the workflow-analyst directory to radar**

```bash
git mv plugins/workflow-analyst plugins/radar
```

- [ ] **Step 2: Update `plugins/radar/.claude-plugin/plugin.json`**

Replace the entire file with:

```json
{
  "name": "radar",
  "description": "AI workflow intelligence — analyzes your coding sessions, scans the ecosystem, and recommends improvements relevant to you.",
  "version": "3.0.0",
  "author": {
    "name": "Peter Brown",
    "url": "https://ptb.io"
  },
  "repository": "https://github.com/flippyhead/radar",
  "license": "MIT",
  "keywords": ["radar", "workflow", "analytics", "insights", "discovery", "recommendations"]
}
```

- [ ] **Step 3: Update `.claude-plugin/plugin.json`**

Replace the entire file with:

```json
{
  "name": "radar",
  "description": "Your AI development radar — workflow intelligence and persistent memory for Claude Code and Cowork",
  "version": "3.0.0",
  "author": {
    "name": "Peter Brown",
    "url": "https://ptb.io"
  },
  "repository": "https://github.com/flippyhead/radar",
  "license": "MIT"
}
```

- [ ] **Step 4: Update `.claude-plugin/marketplace.json`**

Replace the entire file with:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "radar",
  "description": "Your AI development radar — workflow intelligence and persistent memory for Claude Code and Cowork",
  "owner": {
    "name": "Peter Brown",
    "email": "peter@wagglelabs.com"
  },
  "plugins": [
    {
      "name": "radar",
      "description": "Analyzes your coding sessions, scans the AI ecosystem, and recommends tools and techniques that match your goals and workflow.",
      "version": "3.0.0",
      "author": { "name": "Peter Brown" },
      "source": "./plugins/radar"
    },
    {
      "name": "open-brain",
      "description": "Persistent AI memory — save thoughts, track goals, sync projects, and get weekly reviews across all your sessions.",
      "version": "2.0.0",
      "author": { "name": "Peter Brown" },
      "source": "./plugins/open-brain"
    }
  ]
}
```

- [ ] **Step 5: Update `plugins/open-brain/.claude-plugin/plugin.json`**

Change version to `2.0.0` and update the repository URL:

```json
{
  "name": "open-brain",
  "description": "Your personal AI memory layer — zero-input onboarding, project sync, and weekly reviews powered by Open Brain.",
  "version": "2.0.0",
  "author": {
    "name": "Peter Brown",
    "url": "https://ptb.io"
  },
  "repository": "https://github.com/flippyhead/radar",
  "license": "MIT",
  "keywords": ["brain", "memory", "knowledge", "onboarding", "review"]
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: rename workflow-analyst to radar, bump to v3.0.0

BREAKING: Plugin names changed. Reinstall required.
- plugins/workflow-analyst/ → plugins/radar/
- Marketplace identifier: flippyhead/radar
- open-brain bumped to 2.0.0"
```

---

### Task 2: Rename radar skill directories

**Files:**
- Move: `plugins/radar/skills/workflow-analyst/` → `plugins/radar/skills/radar-analyze/`
- Move: `plugins/radar/skills/scout/` → `plugins/radar/skills/radar-scan/`
- Move: `plugins/radar/skills/discover/` → `plugins/radar/skills/radar-recommend/`
- Create: `plugins/radar/skills/radar/SKILL.md`

- [ ] **Step 1: Rename skill directories**

```bash
git mv plugins/radar/skills/workflow-analyst plugins/radar/skills/radar-analyze
git mv plugins/radar/skills/scout plugins/radar/skills/radar-scan
git mv plugins/radar/skills/discover plugins/radar/skills/radar-recommend
mkdir -p plugins/radar/skills/radar
```

- [ ] **Step 2: Commit the renames**

```bash
git add -A
git commit -m "refactor: rename skill directories to radar namespace

- workflow-analyst/ → radar-analyze/
- scout/ → radar-scan/
- discover/ → radar-recommend/
- Create empty radar/ directory for combined skill"
```

---

### Task 3: Update radar-analyze SKILL.md

**Files:**
- Modify: `plugins/radar/skills/radar-analyze/SKILL.md`

- [ ] **Step 1: Update the frontmatter**

Change the frontmatter at the top of the file from:

```
---
name: workflow-analyst
description: Analyze your Claude Code and Cowork session history to surface actionable workflow insights. Diagnoses failures, identifies automation opportunities, aligns time allocation with goals, and flags repeated knowledge worth saving.
argument-hint: [--days N]
---
```

to:

```
---
name: radar-analyze
description: Analyze your Claude Code and Cowork session history to surface actionable workflow insights. Diagnoses failures, identifies automation opportunities, aligns time allocation with goals, and flags repeated knowledge worth saving.
argument-hint: [--days N]
---
```

- [ ] **Step 2: Update the heading**

Change `# AI Workflow Analyst` to `# Radar Analyze`.

- [ ] **Step 3: Make brain optional in Step 2 (Check Previous Insights)**

The current Step 2 ends with `If the MCP tool is unavailable, skip this step.` — this is already correct brain-optional behavior. No change needed.

Verify Step 3 (Fetch User Goals) also has the fallback: `If unavailable, skip goal-based analysis.` — already correct.

- [ ] **Step 4: Update Step 5 (Publish) — add brain-optional fallback**

After the line `If publish fails, fall back to saving insights via create_report or capture_thought MCP tools.`, add:

```
If no brain MCP tools are available, skip publishing entirely — the terminal output from Step 6 is the primary output in terminal-only mode.
```

- [ ] **Step 5: Update Step 6 (Summary) — brain-optional messaging**

Replace the last bullet:
```
- Direct the user to /insights in the AI Brain web UI to review and provide feedback
```

with:

```
- If brain is connected: "Insights also saved to your brain. Review at /insights in the AI Brain web UI."
- If terminal-only: no brain reference in the output
```

- [ ] **Step 6: Commit**

```bash
git add plugins/radar/skills/radar-analyze/SKILL.md
git commit -m "feat: update radar-analyze skill with new name and brain-optional messaging"
```

---

### Task 4: Update radar-scan SKILL.md

**Files:**
- Modify: `plugins/radar/skills/radar-scan/SKILL.md`

- [ ] **Step 1: Update the frontmatter**

Change:
```
---
name: scout
description: Build a catalogue of AI tools, features, and techniques from external sources. Scans dependency changelogs, HN, GitHub, and your inbox.
argument-hint: [--sources <all|feeds|manual>] [--days N]
---
```

to:

```
---
name: radar-scan
description: Scan external sources for AI tools, features, and techniques. Builds a discovery catalogue from dependency changelogs, HN, GitHub, YouTube, and your inbox.
argument-hint: [--sources <all|feeds|manual>] [--days N]
---
```

- [ ] **Step 2: Update the heading**

Change `# Scout — AI Discovery Catalogue Builder` to `# Radar Scan — Discovery Catalogue Builder`.

- [ ] **Step 3: Update local catalogue filename**

Replace all occurrences of `~/.claude/scout-catalogue.json` with `~/.claude/radar-catalogue.json`.

- [ ] **Step 4: Add migration logic for old catalogue file**

In Step 1, under the `**If brain MCP is unavailable:**` section, after `Use local JSON file at ~/.claude/radar-catalogue.json. Read it if it exists`, add:

```
If `~/.claude/radar-catalogue.json` does not exist but `~/.claude/scout-catalogue.json` does, rename `~/.claude/scout-catalogue.json` to `~/.claude/radar-catalogue.json` and use it.
```

- [ ] **Step 5: Rename brain list references**

Replace all occurrences of `[Scout]` with `[Radar]` throughout the file. This affects list names: `[Radar] Inbox`, `[Radar] Claude Code`, `[Radar] MCP Ecosystem`, `[Radar] AI Tools & Techniques`.

- [ ] **Step 6: Add within-run deduplication note**

In Step 3 (Scan Structured Sources), after `For each result across all sources: skip if the URL already exists in the catalogue (deduplication).`, add:

```
Also deduplicate across sources within this run — if the same URL was found by both HN and GitHub in this run, only catalogue it once.
```

- [ ] **Step 7: Commit**

```bash
git add plugins/radar/skills/radar-scan/SKILL.md
git commit -m "feat: update radar-scan skill with new name, catalogue migration, and dedup fix"
```

---

### Task 5: Update radar-recommend SKILL.md

**Files:**
- Modify: `plugins/radar/skills/radar-recommend/SKILL.md`

- [ ] **Step 1: Update the frontmatter**

Change:
```
---
name: discover
description: Match catalogued AI tools and techniques against your goals and usage patterns. Surfaces personalized recommendations.
argument-hint: [--days N] [--focus <category>]
---
```

to:

```
---
name: radar-recommend
description: Match catalogued AI tools and techniques against your goals and usage patterns. Surfaces personalized recommendations.
argument-hint: [--days N] [--focus <category>]
---
```

- [ ] **Step 2: Update the heading**

Change `# Discover — Personalized AI Recommendations` to `# Radar Recommend — Personalized AI Recommendations`.

- [ ] **Step 3: Update internal cross-references**

Replace `Run \`/scout\` first` with `Run \`/radar-scan\` first`.

Replace `try running \`/scout\` or adding items to \`[Scout] Inbox\`` with `try running \`/radar-scan\` or adding items to \`[Radar] Inbox\``.

- [ ] **Step 4: Rename brain list references**

Replace all occurrences of `[Scout]` with `[Radar]` throughout the file.

- [ ] **Step 5: Update local catalogue filename**

Replace all occurrences of `~/.claude/scout-catalogue.json` with `~/.claude/radar-catalogue.json`.

- [ ] **Step 6: Update brain-optional messaging in Step 5 (Publish)**

After the `create_report` instructions, add:

```
**Terminal-only mode:** If brain MCP tools are unavailable, skip publishing. The terminal output from Step 4 is the primary output. Do not warn about brain being unavailable.
```

- [ ] **Step 7: Update Step 7 (Summary) — brain-optional messaging**

Replace:
```
- Direct the user to /insights in the AI Brain web UI to review and provide feedback
```

with:

```
- If brain is connected: "Recommendations also saved to your brain. Review at /insights in the AI Brain web UI."
- If terminal-only: no brain reference in the output
```

- [ ] **Step 8: Commit**

```bash
git add plugins/radar/skills/radar-recommend/SKILL.md
git commit -m "feat: update radar-recommend skill with new name and brain-optional messaging"
```

---

### Task 6: Create combined `/radar` skill

**Files:**
- Create: `plugins/radar/skills/radar/SKILL.md`

- [ ] **Step 1: Write the combined skill**

Create `plugins/radar/skills/radar/SKILL.md` with:

```markdown
---
name: radar
description: Your AI development radar — scan the ecosystem for new tools and techniques, then get personalized recommendations. Combines radar-scan and radar-recommend in one command.
argument-hint: [--days N] [--sources <all|feeds|manual>] [--focus <category>]
---

# Radar

Combined scan + recommend pipeline. Scans external sources for new AI tools and techniques, then matches them against your goals and usage patterns to surface personalized recommendations.

This is the default entry point. Use `/radar-scan` or `/radar-recommend` separately if you need different scheduling cadences (e.g., scan daily, recommend weekly).

## Arguments

- `$ARGUMENTS` — Optional:
  - `--days N` — Lookback window for both scan and recommend (default: 7 for scan, 14 for recommend)
  - `--sources <all|feeds|manual>` — Source filter for scan phase (default: all). "feeds" = structured external sources (Anthropic, HN, GitHub, YouTube, dependency changelogs). "manual" = process user-added inbox items only.
  - `--focus <category>` — Category filter for recommend phase (claude-code, mcp, api, agent-sdk, prompting, tooling, workflow, general-ai)

Parse from `$ARGUMENTS` if provided.

## Workflow

### Phase 1: Scan

Execute the full `/radar-scan` workflow with the `--sources` and `--days` arguments.

Print a brief summary of scan results (new items catalogued, notable finds) before proceeding.

### Phase 2: Recommend

Execute the full `/radar-recommend` workflow with the `--days` and `--focus` arguments.

This phase uses the freshly updated catalogue from Phase 1, ensuring recommendations reflect the latest scan.

### Summary

Output a combined summary:
- Scan: how many new items catalogued, by source
- Recommendations: top "Act Now" items
- If brain is connected: "Results saved to your brain."
- If terminal-only: no brain reference
```

- [ ] **Step 2: Commit**

```bash
git add plugins/radar/skills/radar/SKILL.md
git commit -m "feat: add combined /radar skill (scan + recommend)"
```

---

### Task 7: Simplify the open-brain SessionStart hook

**Files:**
- Modify: `plugins/open-brain/hooks/check-brain-status.mjs`
- Modify: `plugins/open-brain/hooks/hooks.json`

- [ ] **Step 1: Rewrite `check-brain-status.mjs` with single health-check fetch**

Replace the entire file with:

```javascript
#!/usr/bin/env node

// Check if the user's Open Brain has any thoughts.
// If empty, suggest running /brain-init.
// Exits silently if brain has content or is unreachable.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_BRAIN_URL = "https://ai-brain-pi.vercel.app/api/mcp";

async function getBrainUrl() {
  try {
    const hookDir = dirname(fileURLToPath(import.meta.url));
    const configPath = join(hookDir, "..", ".mcp.json");
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    return config?.mcpServers?.["ai-brain"]?.url || DEFAULT_BRAIN_URL;
  } catch {
    return DEFAULT_BRAIN_URL;
  }
}

function getAuthHeader() {
  const explicitAuth =
    process.env.OPEN_BRAIN_AUTHORIZATION ?? process.env.MCP_AUTHORIZATION;
  if (explicitAuth) return explicitAuth;

  const token =
    process.env.OPEN_BRAIN_TOKEN ??
    process.env.OPEN_BRAIN_API_KEY ??
    process.env.MCP_AUTH_TOKEN;
  return token ? `Bearer ${token}` : undefined;
}

async function checkBrainStatus() {
  try {
    const brainUrl = await getBrainUrl();
    const headers = { "Content-Type": "application/json" };
    const authorization = getAuthHeader();
    if (authorization) headers.Authorization = authorization;

    // Single POST with initialize + get_stats in sequence via batch
    // Use a simple approach: initialize, then immediately call get_stats
    const initRes = await fetch(brainUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "open-brain-hook", version: "2.0.0" },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!initRes.ok) process.exit(0);

    const sessionId = initRes.headers.get("mcp-session-id");
    if (sessionId) headers["mcp-session-id"] = sessionId;

    // Send initialized notification + get_stats in one go
    await fetch(brainUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    const statsRes = await fetch(brainUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_stats", arguments: {} },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!statsRes.ok) process.exit(0);

    const data = await statsRes.json();
    const content = data?.result?.content?.[0]?.text;
    if (content) {
      const stats = JSON.parse(content);
      if (stats.totalThoughts === 0) {
        console.log(
          "Your Open Brain is empty. Run `/brain-init` to set up your knowledge base from connected tools and AI memory."
        );
      }
    }
  } catch {
    // Any error — exit silently
  }
}

checkBrainStatus();
```

- [ ] **Step 2: Update hook timeout in `hooks.json`**

Replace the entire file with:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_DIR}/hooks/check-brain-status.mjs\"",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

(Changed timeout from 15000 to 10000.)

- [ ] **Step 3: Commit**

```bash
git add plugins/open-brain/hooks/
git commit -m "fix: simplify open-brain hook — reduce fetch calls, lower timeout to 10s"
```

---

### Task 8: Add radar first-run hook

**Files:**
- Create: `plugins/radar/hooks/hooks.json`
- Create: `plugins/radar/hooks/first-run.mjs`

- [ ] **Step 1: Create `plugins/radar/hooks/hooks.json`**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_DIR}/hooks/first-run.mjs\"",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Create `plugins/radar/hooks/first-run.mjs`**

```javascript
#!/usr/bin/env node

// First-run detection for the radar plugin.
// If no catalogue file and no previous analysis output exist,
// suggest running /radar-analyze to get started.

import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkFirstRun() {
  try {
    const home = homedir();
    const catalogueExists = await fileExists(
      join(home, ".claude", "radar-catalogue.json")
    );
    const legacyCatalogueExists = await fileExists(
      join(home, ".claude", "scout-catalogue.json")
    );
    const analysisOutputExists = await fileExists(
      "/tmp/workflow-analyzer-parsed.json"
    );

    if (!catalogueExists && !legacyCatalogueExists && !analysisOutputExists) {
      console.log(
        "Welcome to Radar. Try `/radar-analyze` to analyze your recent coding sessions, or `/radar` to scan the ecosystem and get recommendations."
      );
    }
  } catch {
    // Any error — exit silently
  }
}

checkFirstRun();
```

- [ ] **Step 3: Commit**

```bash
git add plugins/radar/hooks/
git commit -m "feat: add radar first-run detection hook"
```

---

### Task 9: Update open-brain skill cross-references

**Files:**
- Modify: `plugins/open-brain/skills/weekly-review/SKILL.md`

- [ ] **Step 1: Update weekly-review install reference**

In the `weekly-review/SKILL.md` file, find:

```
> "Install the `workflow-analyst` plugin (`/plugin install workflow-analyst@claude-workflow-analyst`) for time allocation analysis."
```

Replace with:

```
> "Install the `radar` plugin (`/plugin install radar@flippyhead/radar`) for time allocation analysis."
```

- [ ] **Step 2: Commit**

```bash
git add plugins/open-brain/skills/weekly-review/SKILL.md
git commit -m "fix: update weekly-review cross-reference to radar plugin"
```

---

### Task 10: Create version bump script

**Files:**
- Create: `scripts/bump-version.sh`

- [ ] **Step 1: Create the scripts directory and bump script**

```bash
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

# Use node for reliable JSON editing
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
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/bump-version.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/bump-version.sh
git commit -m "chore: add version bump script for syncing all 3 version locations"
```

---

### Task 11: Rewrite README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md**

Replace the entire file with:

```markdown
# Radar

Your AI development radar. Watches your sessions, scans the ecosystem, and recommends what matters to you.

Ships two plugins:
- **Radar** — workflow intelligence for Claude Code and Cowork
- **Open Brain** — persistent AI memory across sessions

## Quick Start

```bash
# Install both plugins (one command)
/plugin marketplace add flippyhead/radar

# Try it
/radar-analyze
```

## Commands

### Radar (workflow intelligence)

| Command | What it does |
|---------|-------------|
| `/radar` | Scan ecosystem + recommend improvements (combined) |
| `/radar-analyze` | Analyze your recent coding sessions |
| `/radar-scan` | Scan external sources for new tools and techniques |
| `/radar-recommend` | Get personalized recommendations from your catalogue |

### Open Brain (persistent memory)

| Command | What it does |
|---------|-------------|
| `/brain-init` | Set up your brain from connected tools |
| `/brain-sync` | Sync current project to your brain |
| `/weekly-review` | Weekly synthesis of your work and goals |

## How They Work Together

Radar works standalone — session analysis and ecosystem scanning run in terminal-only mode with zero setup.

Connect [Open Brain](https://ai-brain-pi.vercel.app) for cross-session memory: persistent catalogue, goal-aware recommendations, and weekly reviews.

## Install Individually

```bash
# Just workflow intelligence
/plugin install radar@flippyhead/radar

# Just persistent memory
/plugin install open-brain@flippyhead/radar
```

## Upgrading from `claude-workflow-analyst`?

```bash
/plugin marketplace remove flippyhead/claude-workflow-analyst
/plugin marketplace add flippyhead/radar
```

Your Open Brain data is unchanged — it lives on the server, not in the plugin.

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for radar rebrand"
```

---

### Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace CLAUDE.md**

Replace the entire file with:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A plugin marketplace repo shipping two plugins. Published as `flippyhead/radar`.

- **Radar** — AI workflow intelligence. Analyzes coding sessions, scans the ecosystem, recommends improvements.
- **Open Brain** — Persistent AI memory. Lists, thoughts, project sync, weekly reviews. Powered by [Open Brain](https://ai-brain-pi.vercel.app).

## Repo Structure

```
.claude-plugin/          — root plugin config (plugin.json) + marketplace listing (marketplace.json)
plugins/
  radar/                 — workflow intelligence plugin
    .claude-plugin/      — per-plugin plugin.json
    .mcp.json            — MCP server config (ai-brain HTTP connector, optional)
    hooks/               — hooks.json + first-run.mjs (SessionStart hook)
    skills/
      radar/SKILL.md             — combined scan + recommend
      radar-analyze/SKILL.md     — session analysis
      radar-scan/SKILL.md        — external source scanning
      radar-recommend/SKILL.md   — personalized recommendations
  open-brain/            — persistent memory plugin
    .claude-plugin/      — per-plugin plugin.json
    .mcp.json            — MCP server config (ai-brain HTTP connector)
    hooks/               — hooks.json + check-brain-status.mjs (SessionStart hook)
    skills/
      brain-init/SKILL.md
      brain-sync/SKILL.md
      weekly-review/SKILL.md
scripts/
  bump-version.sh        — updates version in all 3 locations
```

## Version Management

**ALWAYS bump the version when making changes that affect plugin behavior.**

Version numbers live in three places and must stay in sync:

1. `.claude-plugin/plugin.json` — root plugin version (tracks the highest plugin version)
2. `.claude-plugin/marketplace.json` — version for each plugin listed
3. `plugins/<plugin-name>/.claude-plugin/plugin.json` — per-plugin version

Use `./scripts/bump-version.sh <plugin> <version>` to update all three.

Bump rules:
- **Patch** (3.0.0 → 3.0.1): bug fixes
- **Minor** (3.0.0 → 3.1.0): new features or skill changes
- **Major** (3.0.0 → 4.0.0): breaking changes

## Architecture

**Skills** are SKILL.md files containing structured prompts with frontmatter (name, description, argument-hint). They define multi-step workflows that Claude executes at runtime. Skills are NOT code — they are instructions.

**Brain-optional design:** All radar skills work without Open Brain connected. Brain adds persistence, cross-session history, and richer recommendations. Skills detect brain availability via a lightweight MCP call at the start and proceed in terminal-only mode if unavailable — no warnings.

**Hooks** are executable scripts (Node.js ESM) triggered by Claude Code lifecycle events. Each plugin owns its own hooks:
- Radar: `first-run.mjs` detects first use and suggests `/radar-analyze`
- Open Brain: `check-brain-status.mjs` checks if brain is empty and suggests `/brain-init`

**MCP config** (`.mcp.json`) declares the Open Brain HTTP MCP server. Both plugins declare the same server URL (`https://ai-brain-pi.vercel.app/api/mcp`). Radar tolerates connection failure (terminal-only mode). Open Brain requires it.

**External dependency**: Radar skills shell out to `npx @flippyhead/workflow-analyzer@latest` for session parsing, insight publishing, and dependency scanning. This is a separate npm package.

## Plugin Install Commands

```bash
/plugin marketplace add flippyhead/radar
/plugin install radar@flippyhead/radar
/plugin install open-brain@flippyhead/radar
```
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for radar rebrand and new structure"
```

---

### Task 13: Rename GitHub repo

**Files:** None (GitHub operation)

- [ ] **Step 1: Rename the repo on GitHub**

```bash
gh repo rename radar
```

This automatically sets up a redirect from `flippyhead/claude-workflow-analyst` to `flippyhead/radar`.

- [ ] **Step 2: Update the local git remote**

```bash
git remote set-url origin git@github.com:flippyhead/radar.git
```

- [ ] **Step 3: Push all changes**

```bash
git push origin main
```

- [ ] **Step 4: Verify the repo is accessible**

```bash
gh repo view flippyhead/radar --json name,url
```

---

### Task 14: Smoke test

**Files:** None

- [ ] **Step 1: Verify plugin structure is valid**

```bash
# Check all required files exist
ls -la .claude-plugin/plugin.json .claude-plugin/marketplace.json
ls -la plugins/radar/.claude-plugin/plugin.json plugins/radar/.mcp.json
ls -la plugins/radar/skills/radar/SKILL.md
ls -la plugins/radar/skills/radar-analyze/SKILL.md
ls -la plugins/radar/skills/radar-scan/SKILL.md
ls -la plugins/radar/skills/radar-recommend/SKILL.md
ls -la plugins/radar/hooks/hooks.json plugins/radar/hooks/first-run.mjs
ls -la plugins/open-brain/.claude-plugin/plugin.json
ls -la plugins/open-brain/hooks/hooks.json plugins/open-brain/hooks/check-brain-status.mjs
ls -la scripts/bump-version.sh
```

- [ ] **Step 2: Verify JSON files parse correctly**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json', 'utf-8'))"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json', 'utf-8'))"
node -e "JSON.parse(require('fs').readFileSync('plugins/radar/.claude-plugin/plugin.json', 'utf-8'))"
node -e "JSON.parse(require('fs').readFileSync('plugins/open-brain/.claude-plugin/plugin.json', 'utf-8'))"
node -e "JSON.parse(require('fs').readFileSync('plugins/radar/hooks/hooks.json', 'utf-8'))"
node -e "JSON.parse(require('fs').readFileSync('plugins/open-brain/hooks/hooks.json', 'utf-8'))"
```

- [ ] **Step 3: Verify version consistency**

```bash
node -e "
const root = JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json', 'utf-8'));
const mp = JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json', 'utf-8'));
const radar = JSON.parse(require('fs').readFileSync('plugins/radar/.claude-plugin/plugin.json', 'utf-8'));
const brain = JSON.parse(require('fs').readFileSync('plugins/open-brain/.claude-plugin/plugin.json', 'utf-8'));

const radarMp = mp.plugins.find(p => p.name === 'radar');
const brainMp = mp.plugins.find(p => p.name === 'open-brain');

console.log('Root:', root.version);
console.log('Radar (plugin.json):', radar.version, '| Radar (marketplace):', radarMp.version);
console.log('Open Brain (plugin.json):', brain.version, '| Open Brain (marketplace):', brainMp.version);

const ok = radar.version === radarMp.version && brain.version === brainMp.version;
console.log(ok ? 'PASS: versions in sync' : 'FAIL: version mismatch');
"
```

- [ ] **Step 4: Verify no old references remain**

```bash
# Should return NO results for these patterns:
grep -r "workflow-analyst" plugins/ --include="*.md" --include="*.json" || echo "PASS: no workflow-analyst references"
grep -r "claude-workflow-analyst" plugins/ README.md CLAUDE.md --include="*.md" --include="*.json" || echo "PASS: no claude-workflow-analyst references"
grep -r "\[Scout\]" plugins/ --include="*.md" || echo "PASS: no [Scout] references"
grep -r "scout-catalogue" plugins/ --include="*.md" || echo "PASS: no scout-catalogue references"
```

- [ ] **Step 5: Test hooks execute without errors**

```bash
node plugins/open-brain/hooks/check-brain-status.mjs
echo "Open brain hook exit code: $?"

node plugins/radar/hooks/first-run.mjs
echo "Radar hook exit code: $?"
```

Both should exit with code 0.

- [ ] **Step 6: Test bump-version script**

```bash
# Dry run — bump radar to 3.0.1 then revert
./scripts/bump-version.sh radar 3.0.1
git diff --stat
git checkout -- .claude-plugin/ plugins/radar/.claude-plugin/
```
