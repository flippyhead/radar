---
name: radar-scan
description: Scan external sources for AI tools, features, and techniques. Builds a discovery catalogue from dependency changelogs, HN, GitHub, YouTube, and your inbox.
argument-hint: [--sources <all|feeds|manual>] [--days N]
---

# Radar Scan — Discovery Catalogue Builder

Build and maintain a catalogue of AI tools, features, and techniques from external sources.

**This skill is self-contained — it does not depend on or use the Open Brain plugin, ai-brain MCP, or any external memory service.**

## Arguments

- `$ARGUMENTS` — Optional:
  - `--sources <all|feeds|manual>` — Which sources to scan (default: all)
  - `--days N` — How far back to look in time-based sources (default: 7)

Parse from `$ARGUMENTS` if provided. Default to `--sources all --days 7`.

## Workflow

### Step 1: Load or Initialize Catalogue

Read `~/.claude/radar/catalogue.json`. If it doesn't exist:

1. Check for legacy paths and migrate if found:
   - `~/.claude/radar-catalogue.json` or `~/.claude/scout-catalogue.json`
   - Read the legacy file. If it uses the old schema (`{ "lists": { "[Radar] ...": { "items": [...] } } }`), transform it: flatten all items from all lists into a single `items` array, map each item's fields to the new schema (add `id`, `status: "reviewed"`, `notes: []`, `score: null`, `scoreBreakdown: null`, `reviewedAt: null`, `lastRecommended: null`), and wrap in the new structure: `{ "version": "1.0", "updatedAt": "<now>", "items": [...], "insights": [] }`.
   - If the legacy file already uses the new flat schema, move it directly.
   - Write the result to `~/.claude/radar/catalogue.json`. Delete the legacy file after successful migration.
2. If no legacy file exists, initialize with empty structure:

```json
{
  "version": "1.0",
  "updatedAt": null,
  "items": [],
  "insights": []
}
```

Create the `~/.claude/radar/` directory if it doesn't exist.

Build a set of known URLs from existing items for deduplication.

### Step 2: Scan Project Dependencies

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/workflow-analyzer/dist/cli.js" scan-deps --since ${DAYS} --output /tmp/workflow-analyzer-deps.json`. Read the output JSON. If the bundled binary is not available, fall back to `npx @flippyhead/workflow-analyzer@latest scan-deps --since ${DAYS} --output /tmp/workflow-analyzer-deps.json`.

If the command fails or is not available, log a warning and skip to Step 3 — dependency scanning is additive, not required.

If `GITHUB_TOKEN` is not set in the environment and the scan-deps output shows `rateLimited > 0`, print: "GitHub API rate limited — scanned [reposResolved] of [packageCount] dependencies. Set GITHUB_TOKEN for full scanning."

For each entry in the `releases` array:
1. Read the `release.body` (release notes) and `repoDescription` to assess relevance
2. **Skip** routine releases: patch version bumps, typo fixes, minor dep updates, internal refactors, CI/CD changes, documentation-only releases
3. **Catalogue** interesting releases: new CLI tools, MCP servers/integrations, AI/agent features, breaking changes, significant new APIs, performance improvements
4. Create catalogue items using the standard enrichment from Step 5, with `source: "dependency"` and tag `"direct-dependency"`
5. Use the `release.url` as the item URL for deduplication against existing catalogue

### Step 3: Scan Structured Sources

Skip this step if `--sources manual` was specified.

Limit to **10-15 items per source**. If a source fails (timeout, rate limit, format change), log a warning and continue to the next source — never fail the entire run.

When a source fails, print a clear one-line message: "Source [name] unavailable: [reason]. Continuing with remaining sources."

**Anthropic changelog/blog:**
Use `WebFetch` on `https://docs.anthropic.com/en/docs/about-claude/models` and `https://www.anthropic.com/news` to find recent releases and feature announcements. Extract title, URL, and a one-line description for each.

**Hacker News:**
Use `WebFetch` on the Algolia API:
- `https://hn.algolia.com/api/v1/search_by_date?query=claude+code&tags=story&numericFilters=created_at_i>${DAYS_AGO_TIMESTAMP}`
- `https://hn.algolia.com/api/v1/search_by_date?query=anthropic+mcp&tags=story&numericFilters=created_at_i>${DAYS_AGO_TIMESTAMP}`
- `https://hn.algolia.com/api/v1/search_by_date?query=ai+agent+tool&tags=story&numericFilters=created_at_i>${DAYS_AGO_TIMESTAMP}`

Extract title, URL (use `url` field, fall back to HN comment URL), and points as a quality signal. Only keep items with 5+ points.

**GitHub:**
Use `WebSearch` for:
- "new MCP server" site:github.com (last N days)
- "claude code plugin" site:github.com (last N days)

Extract repo name, URL, and description.

**YouTube:**
Use `WebSearch` for:
- "claude code tutorial" (last N days)
- "anthropic MCP" tutorial (last N days)

Extract video title, URL, and channel name.

For each result across all sources: skip if the URL already exists in the catalogue (deduplication).

Also deduplicate across sources within this run — if the same URL was found by both HN and GitHub in this run, only catalogue it once.

### Step 4: Process Manual Inbox Items

Skip this step if `--sources feeds` was specified.

Look for items in the catalogue with `source: "manual"` and `status: "new"`. For each:

1. If the item has a URL, use `WebFetch` to get the page content
2. Summarize what it is and why it might be useful (1-2 sentences) — update `description`
3. Classify it (see Step 5 for category/tag schema)
4. Update category and tags on the existing item
5. Set `status: "reviewed"` and `reviewedAt` to now

### Step 5: Enrich and Tag

For each new catalogue entry (from Step 2 or Step 3), create an item object:

```json
{
  "id": "<first 12 chars of SHA-256 hash of the URL>",
  "title": "...",
  "url": "...",
  "description": "1-2 sentence summary",
  "category": "<one of: claude-code, mcp, api, agent-sdk, prompting, tooling, workflow, general-ai>",
  "tags": ["<free-text tags describing what workflows/goals this helps with>"],
  "source": "<one of: anthropic, hackernews, github, youtube, manual, dependency>",
  "discoveredAt": "<ISO date>",
  "status": "new",
  "notes": [],
  "score": null,
  "scoreBreakdown": null,
  "reviewedAt": null,
  "lastRecommended": null
}
```

Choose category based on the content:
- `claude-code` — Claude Code features, settings, shortcuts, plugins
- `mcp` — MCP servers, protocols, integrations
- `api` — Claude API features, SDK updates
- `agent-sdk` — Agent building tools and frameworks
- `prompting` — Prompting techniques, system prompts, skill design
- `tooling` — Developer tools, CLI utilities, browser extensions
- `workflow` — Workflow patterns, automation techniques, productivity methods
- `general-ai` — Broader AI developments, models, research

Append each new item to the catalogue's `items` array. Update `updatedAt` to now. Write the catalogue back to `~/.claude/radar/catalogue.json`.

### Step 6: Report

Output a brief terminal summary:
- How many new items were catalogued, by source
- How many inbox items were processed
- How many duplicates were skipped
- The 3-5 most notable new finds (title + one-line description)
- Total catalogue size
