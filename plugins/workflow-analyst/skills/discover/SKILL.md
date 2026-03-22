---
name: discover
description: Match catalogued AI tools and techniques against your goals and usage patterns. Surfaces personalized recommendations.
argument-hint: [--days N] [--focus <category>]
---

# Discover — Personalized AI Recommendations

Match the scout catalogue against your personal context — goals, usage patterns, current projects, and installed tools — to surface what you should be paying attention to.

## Arguments

- `$ARGUMENTS` — Optional:
  - `--days N` — How far back to look at session history (default: 14)
  - `--focus <category>` — Filter to a specific category (claude-code, mcp, api, agent-sdk, prompting, tooling, workflow, general-ai)

Parse from `$ARGUMENTS` if provided.

## Workflow

### Step 1: Load the Catalogue

**Brain mode:** Call `get_lists` and find all lists with names starting with `[Scout]` (excluding `[Scout] Inbox`). For each, call `get_list` and collect all items with status "open".

**Local mode:** Read `~/.claude/scout-catalogue.json` and collect all items with status "open" across all lists (excluding Inbox).

If the catalogue is empty, tell the user: "No catalogue entries found. Run `/scout` first to build your discovery catalogue."

If `--focus` was specified, filter items to only those with matching `properties.category`.

### Step 2: Load Personal Context

Pull from multiple sources. Each is optional — work with whatever is available.

**Brain goals:**
Call `get_lists` with `pinned: true` to get the user's stated goals and priorities. Extract goal titles and descriptions.

**Brain thoughts:**
Call `browse_recent` with a generous `limit` (e.g., 50) to get recent thoughts. Note: `browse_recent` does not support date filtering — it returns the N most recent thoughts regardless of date. Filter results client-side by checking each thought's creation date, keeping only those from the last 14 days. Note recurring topics and themes.

**Session history:**
Run: `npx @flippyhead/workflow-analyzer@latest parse --since ${DAYS} --output /tmp/discover-sessions.json`

Read the output file. If session history exceeds 50 sessions, summarize the top patterns:
- Most-used tools (top 10)
- Most-active projects (by session count)
- Recurring topics in user prompts
- Tool failure patterns

**Current environment:**
- Read `~/.claude/settings.json` for installed permissions and allowed tools
- Look for `.mcp.json` files in the home directory and current project for installed MCP servers
- Check `~/.claude/plugins/` for installed plugins

### Step 3: Match and Rank

For each open catalogue item, evaluate against the loaded context. Score on four dimensions:

**Goal alignment (0-3):**
- 3: Directly addresses a pinned goal
- 2: Related to a goal's domain
- 1: Tangentially useful
- 0: No connection

**Usage gap (0-3):**
- 3: User is doing something manually that this automates (evidence in session data)
- 2: User is using a tool that has a better/newer alternative
- 1: User works in the relevant domain but hasn't needed this yet
- 0: No gap identified

**Recency (0-2):**
- 2: Released in the last 7 days
- 1: Released in the last 30 days, or newly relevant due to a recently started project
- 0: Older

**Effort/impact (0-2):**
- 2: Low effort, high impact (e.g., a config change or install command)
- 1: Medium effort or medium impact
- 0: High effort or low impact

**Total score: 0-10.** Skip items scoring below 3 — they don't connect to the user's context meaningfully.

### Step 4: Present Recommendations

Sort by total score descending. Group into tiers:

**Act Now** (score 7-10):
Items with high relevance and low effort. Lead with what the user is doing that this improves. Format:

> **[Title]** (score: N/10)
> You're [specific observation from session data or goals]. [This tool/feature] [specific benefit].
> **Next step:** [concrete action — install command, link to try, config change]

**Worth Exploring** (score 5-6):
Items with high relevance but higher effort. Format:

> **[Title]** (score: N/10)
> Given your goal of [goal], this [what it does]. Worth a deeper look when [suggested timing].
> **Link:** [url]

**On Your Radar** (score 3-4):
Items with moderate relevance. Brief format:

> **[Title]** — [one sentence on what it is and why it might matter] ([url])

Limit output to:
- Act Now: up to 5 items
- Worth Exploring: up to 5 items
- On Your Radar: up to 5 items

If no items score above 3, report: "Nothing in the current catalogue connects strongly to your goals and usage patterns. The catalogue may need more entries — try running `/scout` or adding items to `[Scout] Inbox`."

### Step 5: Update Catalogue State

For each item that was recommended, update its properties to include:
- `lastRecommended`: today's ISO date
- `matchedGoals`: array of goal titles it matched against
- `matchedPatterns`: array of usage patterns that triggered the match

**Brain mode:** The `update_list_item` MCP tool replaces the entire `properties` field — it does NOT merge. So you must: (1) read the item's existing properties from the `get_list` response, (2) merge the new keys (`lastRecommended`, `matchedGoals`, `matchedPatterns`) into the existing properties object client-side, (3) send the full merged object to `update_list_item`.
**Local mode:** Update the JSON file (same merge-then-write approach).

Items with `lastRecommended` within the last 14 days should be deprioritized (reduce score by 2) on subsequent runs to avoid re-surfacing the same recommendations.

### Step 6: Optionally Save to Brain

If brain MCP is available, offer:

"Want me to save a discovery digest to your brain? This helps weekly-review track what's been recommended."

If yes, call `capture_thought` with:
"Discovery digest (${date}): Reviewed ${N} catalogue items against ${M} goals. Top recommendations: [1-2 sentence summary of Act Now items]. Key themes: [categories with highest scores]."
