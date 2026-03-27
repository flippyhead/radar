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
