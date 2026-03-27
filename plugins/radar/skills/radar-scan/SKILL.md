---
name: radar-scan
description: Scan external sources for AI tools, features, and techniques. Builds a discovery catalogue from dependency changelogs, HN, GitHub, YouTube, and your inbox.
argument-hint: [--sources <all|feeds|manual>] [--days N]
---

# Radar Scan — Discovery Catalogue Builder

Build and maintain a catalogue of AI tools, features, and techniques from external sources. Runs independently of your personal context.

## Arguments

- `$ARGUMENTS` — Optional:
  - `--sources <all|feeds|manual>` — Which sources to scan (default: all)
  - `--days N` — How far back to look in time-based sources (default: 7)

Parse from `$ARGUMENTS` if provided. Default to `--sources all --days 7`.

## Workflow

### Step 1: Check/Create Catalogue Lists

Check if the ai-brain MCP tools are available (try calling `get_lists`).

**If brain MCP is available:**

Call `get_lists` and look for lists with names starting with `[Radar]`. Create any that are missing:
- `[Radar] Inbox` — raw links dropped by user for enrichment
- `[Radar] Claude Code` — features, settings, tips
- `[Radar] MCP Ecosystem` — servers, plugins, integrations
- `[Radar] AI Tools & Techniques` — broader tools, prompting, workflows

Use `create_list` for each missing list.

**If brain MCP is unavailable:**

Use local JSON file at `~/.claude/radar-catalogue.json`. Read it if it exists, or initialize with empty structure.

If `~/.claude/radar-catalogue.json` does not exist but `~/.claude/scout-catalogue.json` does, rename `~/.claude/scout-catalogue.json` to `~/.claude/radar-catalogue.json` and use it.

```json
{
  "lists": {
    "[Radar] Inbox": { "items": [] },
    "[Radar] Claude Code": { "items": [] },
    "[Radar] MCP Ecosystem": { "items": [] },
    "[Radar] AI Tools & Techniques": { "items": [] }
  },
  "lastUpdated": null
}
```

### Step 2: Load Existing Catalogue

Load all items from `[Radar]` lists to build a set of known URLs for deduplication.

**Brain mode:** Call `get_list` for each `[Radar]` list. Collect all item URLs into a set.
**Local mode:** Read from the JSON file.

### Step 2.5: Scan Project Dependencies

Run `npx @flippyhead/workflow-analyzer@latest scan-deps --since ${DAYS} --output /tmp/workflow-analyzer-deps.json`. Read the output JSON.

If the command fails or is not available, log a warning and skip to Step 3 — dependency scanning is additive, not required.

If `GITHUB_TOKEN` is not set in the environment and the scan-deps output shows `rateLimited > 0`, print: "GitHub API rate limited — scanned [reposResolved] of [packageCount] dependencies. Set GITHUB_TOKEN for full scanning."

For each entry in the `releases` array:
1. Read the `release.body` (release notes) and `repoDescription` to assess relevance
2. **Skip** routine releases: patch version bumps, typo fixes, minor dep updates, internal refactors, CI/CD changes, documentation-only releases
3. **Catalogue** interesting releases: new CLI tools, MCP servers/integrations, AI/agent features, breaking changes, significant new APIs, performance improvements
4. Create catalogue items using the standard enrichment from Step 5, with `source: "dependency-changelog"` and an additional `relevanceHint` of `"direct dependency"`
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

### Step 4: Process Inbox Items

Skip this step if `--sources feeds` was specified.

**Brain mode:** Call `get_list` for the `[Radar] Inbox` list. For each item with status "open":

1. If the item has a URL, use `WebFetch` to get the page content
2. Summarize what it is and why it might be useful (1-2 sentences) — set as `description`
3. Classify it (see Step 5 for category/tag schema)
4. Create a new item in the appropriate `[Radar]` category list using `create_list_item` with the enriched fields
5. Mark the inbox item as "done" using `update_list_item`

**Local mode:** Process items in the Inbox array, move to the appropriate category array.

### Step 5: Enrich and Tag

For each new catalogue entry (from Step 3 or Step 4), set the `properties` field:

```json
{
  "category": "<one of: claude-code, mcp, api, agent-sdk, prompting, tooling, workflow, general-ai>",
  "relevanceHints": ["<free-text tags describing what workflows/goals this helps with>"],
  "source": "<one of: anthropic-changelog, hackernews, github, youtube, manual, dependency-changelog>",
  "discoveredAt": "<ISO date>"
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

Choose `relevanceHints` based on what kinds of work this would help with (e.g., "browser automation", "code review", "testing", "deployment", "project management").

**Brain mode:** Use `create_list_item` with url, description, and properties set.
**Local mode:** Append to the appropriate list in the JSON file. Write the file when done.

### Step 6: Report

Output a brief summary:
- How many new items were catalogued, by source
- How many inbox items were processed
- How many duplicates were skipped
- The 3-5 most notable new finds (title + one-line description)
- Total catalogue size across all `[Radar]` lists
