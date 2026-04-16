---
name: radar-recommend
description: Match catalogued AI tools and techniques against your goals and usage patterns. Surfaces personalized recommendations.
argument-hint: [--days N] [--focus <category>]
---

# Radar Recommend — Personalized AI Recommendations

Match the catalogue against your personal context — usage patterns, current projects, and installed tools — to surface what you should be paying attention to.

**This skill is self-contained — it does not depend on or use the Open Brain plugin, ai-brain MCP, or any external memory service. All data comes from local files.**

## Arguments

- `$ARGUMENTS` — Optional:
  - `--days N` — How far back to look at session history (default: 14)
  - `--focus <category>` — Filter to a specific category (claude-code, mcp, api, agent-sdk, prompting, tooling, workflow, general-ai)

Parse from `$ARGUMENTS` if provided.

## Workflow

### Step 1: Load the Catalogue

Read `~/.claude/radar/catalogue.json` and collect all items with status `"new"`, `"reviewed"`, or `"starred"` (skip dismissed and acted-on).

If the file doesn't exist or is empty, tell the user: "No catalogue entries found. Run `/radar-scan` first to build your discovery catalogue."

If `--focus` was specified, filter items to only those with matching `category`.

### Step 2: Load Personal Context

Pull from multiple sources. Each is optional — work with whatever is available.

**Session history:**
Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/workflow-analyzer/dist/cli.js" parse --since ${DAYS} --output /tmp/discover-sessions.json`

If the bundled binary is not available, fall back to `npx @flippyhead/workflow-analyzer@latest parse --since ${DAYS} --output /tmp/discover-sessions.json`.

Read the output file. If session history exceeds 50 sessions, summarize the top patterns:
- Most-used tools (top 10)
- Most-active projects (by session count)
- Recurring topics in user prompts
- Tool failure patterns

**Current environment:**
- Read `~/.claude/settings.json` for installed permissions and allowed tools
- Look for `.mcp.json` files in the home directory and current project for installed MCP servers
- Check `~/.claude/plugins/` for installed plugins

**User instructions (lightweight):**
- Read `~/.claude/CLAUDE.md` if it exists — look for stated goals, priorities, or focus areas the user has written down. Do not prompt the user to add goals if none are found — just proceed without goal-based scoring.

### Step 3: Match and Rank

For each catalogue item, evaluate against the loaded context. Score on four dimensions:

**Goal alignment (0-3):**
- 3: Directly addresses a stated goal or priority found in CLAUDE.md
- 2: Related to an active project's domain
- 1: Tangentially useful based on session history
- 0: No connection

**Usage gap (0-3):**
- 3: User is doing something manually that this automates (evidence in session data)
- 2: User is using a tool that has a better/newer alternative
- 1: User works in the relevant domain but hasn't needed this yet
- 0: No gap identified

**Recency (0-2):**
- 2: Discovered in the last 7 days
- 1: Discovered in the last 30 days, or newly relevant due to a recently started project
- 0: Older

**Effort/impact (0-2):**
- 2: Low effort, high impact (e.g., a config change or install command)
- 1: Medium effort or medium impact
- 0: High effort or low impact

**Total score: 0-10.** Skip items scoring below 3.

Items with `lastRecommended` within the last 14 days should be deprioritized (reduce score by 2) to avoid re-surfacing the same recommendations.

### Step 4: Present Recommendations

Sort by total score descending. Group into tiers:

**Act Now** (score 7-10):
Items with high relevance and low effort. Lead with what the user is doing that this improves. Format:

> **[Title]** (score: N/10)
> You're [specific observation from session data or goals]. [This tool/feature] [specific benefit].
> **Next step:** [concrete action — install command, link to try, config change]

**Worth Exploring** (score 5-6):
Items with moderate relevance. Format:

> **[Title]** (score: N/10)
> Given your work on [project/domain], this [what it does]. Worth a deeper look when [suggested timing].
> **Link:** [url]

**On Your Radar** (score 3-4):
Brief format:

> **[Title]** — [one sentence on what it is and why it might matter] ([url])

Limit output to:
- Act Now: up to 5 items
- Worth Exploring: up to 5 items
- On Your Radar: up to 5 items

If no items score above 3, report: "Nothing in the current catalogue connects strongly to your usage patterns. The catalogue may need more entries — try running `/radar-scan` or adding items manually."

### Step 5: Save Insights

For items scoring 5+ (Act Now and Worth Exploring tiers), create insight entries and append to the catalogue's `insights` array:

```json
{
  "id": "insight-<timestamp>-<index>",
  "type": "recommendation",
  "observation": "what the data shows — cite the specific usage pattern or environment detail",
  "recommendation": "the concrete action to take",
  "evidence": ["score breakdown: goal=N, gap=N, recency=N, effort=N, total=N"],
  "relatedItems": ["<item id>"],
  "createdAt": "<ISO date>",
  "status": "new"
}
```

### Step 6: Update Catalogue State

For each item that was recommended, update its properties:
- `lastRecommended`: today's ISO date
- `score`: the computed total score
- `scoreBreakdown`: `{ "goalAlignment": N, "usageGap": N, "recency": N, "effort": N }`

Write the updated catalogue back to `~/.claude/radar/catalogue.json`.

### Step 7: Summary

Output a brief terminal summary:
- The top 2-3 "Act Now" recommendations (one line each)
- How many total recommendations across all tiers
- How many new insights were saved to the catalogue
