---
name: radar
description: Your AI development radar — scan the ecosystem for new tools and techniques, then get personalized recommendations. Combines radar-scan and radar-recommend in one command.
argument-hint: [--days N] [--sources <all|feeds|manual>] [--focus <category>]
---

# Radar

Combined scan + recommend pipeline. Scans external sources for new AI tools and techniques, then matches them against your usage patterns to surface personalized recommendations.

**This skill is self-contained — it does not depend on or use the Open Brain plugin, ai-brain MCP, or any external memory service.**

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

### Phase 3: Review

Execute the `/radar-review` workflow with `--status new`. This lets the user immediately act on freshly scanned and scored items — star the good ones, dismiss noise, add notes.

If there are no new items to review (everything was already reviewed), skip this phase and note: "No new items to review."

### Summary

After the review session ends (user says "done" or moves on), output a combined summary:
- Scan: how many new items catalogued, by source
- Recommendations: top "Act Now" items
- Review: items starred, dismissed, noted this session
