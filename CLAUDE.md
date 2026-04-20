# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Claude Code plugin for AI workflow intelligence. Published as `flippyhead/radar`.

**Radar** analyzes your coding sessions, scans the AI ecosystem, and recommends tools and techniques that match your actual usage patterns. All data stays local in `~/.claude/radar/catalogue.json`.

## Repo Structure

```
.claude-plugin/          — root plugin config (plugin.json) + marketplace listing (marketplace.json)
plugins/
  radar/                 — workflow intelligence plugin
    .claude-plugin/      — per-plugin plugin.json
    bin/
      workflow-analyzer/ — bundled CLI (source + compiled dist)
    hooks/               — hooks.json + install.mjs + first-run.mjs
    skills/
      radar/SKILL.md             — combined scan + recommend
      radar-analyze/SKILL.md     — session analysis
      radar-scan/SKILL.md        — external source scanning
      radar-recommend/SKILL.md   — personalized recommendations
      radar-review/SKILL.md      — catalogue review interface
scripts/
  bump-version.sh        — updates version in all 3 locations
```

## Former open-brain plugin

The `open-brain` persistent-memory plugin formerly lived at `plugins/open-brain/`. It moved to `flippyhead/ai-brain-plugin` (distribution) sourced from `flippyhead/ai-brain` (monorepo). This repo is now radar-only.

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

**Local-first design:** All radar skills persist data to `~/.claude/radar/catalogue.json`. No external services required. The catalogue JSON schema is stable and designed for future adapter plugins that can sync to external systems (Notion, Linear, etc.).

**Hooks** are executable scripts (Node.js ESM) triggered by Claude Code lifecycle events:
- Radar: `first-run.mjs` detects first use and suggests `/radar-analyze`

**Bundled tooling**: The workflow-analyzer CLI is bundled under `plugins/radar/bin/workflow-analyzer/`. Skills invoke it via `node "${CLAUDE_PLUGIN_ROOT}/bin/workflow-analyzer/dist/cli.js"`. Dependencies are installed by the PluginInstall hook. The tool is also published as `@flippyhead/workflow-analyzer` on npm (legacy distribution).

## Plugin Install Commands

```bash
# Install from marketplace (recommended)
/plugin marketplace add flippyhead/radar
/plugin install radar@flippyhead/radar
```
