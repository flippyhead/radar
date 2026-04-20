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

### Step 2.5: Build Dismissal-Pattern Summary

Walk the full catalogue (not just the Step 1 filtered set) and collect every item where `status === "dismissed"` that has at least one note with a `tag` field. For items with multiple notes, use only the most recent note that has a non-excluded tag (compare by `at` timestamp; ties broken by array order).

**Exclude the `save-for-later` tag.** It means "I want this but not now" — it is not a negative signal and must not feed into the negative prior. Treat `null` / missing tags as excluded too.

From the remaining dismissed items, build a compact summary (aim for under 400 characters, hard cap 800):

1. **Counts by tag** — `{ "not-relevant": 7, "already-installed": 3, "already-knew": 2, "wrong-score": 1 }`. Drop entries with count 0.
2. **Up to 3 (category, tag) pairs by count** — e.g., `tooling × not-relevant (4)`, `mcp × already-installed (2)`. These are the strongest patterns.
3. **Up to 5 representative reason snippets** — take the most recent non-empty `text` fields, truncate each to 60 chars. Format: `"[tag] text..."`. These give the scoring subagent concrete phrases to match against.

If this qualifying set (dismissed items with a non-excluded tag) contains fewer than 3 items, skip the aggregation — there's not enough signal yet. When assembling the context payload in Step 3, set `dismissalPatterns: (none yet — fewer than 3 dismissals with tags)`.

Append the summary to the **context payload** built in Step 3 under a new `dismissalPatterns:` key. Keep the rest of the payload structure unchanged so caching still works.

### Step 3: Score Each Item (dispatch to Haiku subagents)

Build one shared **context payload** from Steps 2 and 2.5 (session patterns, installed MCPs/plugins, CLAUDE.md goals, dismissalPatterns). Keep it compact — aim for under ~2KB of plain text so it caches well across subagent calls. The dismissalPatterns block is capped at 800 chars per Step 2.5, so the rest of the payload should fit comfortably in the remaining budget. Assemble it once, reuse it for every item.

Then, for each catalogue item, dispatch a Haiku subagent to score it. Send multiple `Agent` tool calls in a single assistant turn so they run in parallel. Use:

```
Agent({
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Score catalogue item",
  prompt: <see template below>,
})
```

**Note (to the session model constructing the prompt):** do NOT include `lastRecommended` in the `Item:` block below. The main loop applies the freshness penalty itself, and exposing `lastRecommended` to Haiku risks the weaker model double-counting it inside the `recency` rubric (which is about *discovery* date only).

**Subagent prompt template:**

> You are scoring one catalogue item against a user's context. Return a single JSON object with keys `goalAlignment`, `usageGap`, `recency`, `effort`, `negativePrior`, `observation`, `recommendation`. No prose around the JSON.
>
> **User context:**
> ```
> <context payload: stated goals, active projects, top tools from session history, installed MCP servers/plugins, recurring prompt themes, dismissalPatterns (counts by tag, top category×tag pairs, recent reason snippets)>
> ```
>
> **Item:**
> - Title: `<title>`
> - URL: `<url>`
> - Category: `<category>`
> - Description: `<description>`
> - Tags: `<tags joined by comma>`
> - Discovered: `<discoveredAt>` (today is `<today>`)
>
> **Rubric — return integers in the stated range:**
>
> - `goalAlignment` (0-3):
>   - 3: directly addresses a stated goal or priority in user context
>   - 2: related to an active project's domain
>   - 1: tangentially useful based on session history
>   - 0: no connection
>
> - `usageGap` (0-3):
>   - 3: user is doing something manually that this automates (evidence in session data)
>   - 2: user uses a tool that has a better/newer alternative here
>   - 1: user works in the relevant domain but hasn't needed this yet
>   - 0: no gap identified
>
> - `recency` (0-2):
>   - 2: discovered in the last 7 days
>   - 1: discovered in the last 30 days, or newly relevant due to a recently started project
>   - 0: older
>
> - `effort` (0-2):
>   - 2: low effort, high impact (config change or install command)
>   - 1: medium effort or medium impact
>   - 0: high effort or low impact
>
> - `negativePrior` (-2 to 0):
>   - -2: strong match to dismissal patterns — same category AND a tag or description phrase that directly echoes a dismissed reason (e.g., user dismissed 4 `tooling × not-relevant` items and this is another tooling item the user will likely dismiss)
>   - -1: moderate match — same category as a frequently-dismissed combo, OR tags/description overlap with a recent dismissed reason (e.g., user dismissed 2 `general-ai` items as `already-knew` and this is another `general-ai` post covering familiar ground)
>   - 0: no notable overlap with dismissal patterns
>
> - `observation` (string, ≤ 160 chars): one sentence citing the specific usage pattern, goal, or environment detail from the user context that makes this item relevant. Be concrete — reference an actual tool, project, or pattern from the context. No generic filler.
>
> - `recommendation` (string, ≤ 160 chars): one sentence with a concrete next step (install command, a specific feature to try, a config change). No "consider exploring" — say the action.
>
> Respond with ONLY the JSON object.

**Once all subagents return,** the main loop computes `total = goalAlignment + usageGap + recency + effort + negativePrior`. Because `negativePrior` ranges from -2 to 0, `total` can be as low as -2 and as high as 10. If `lastRecommended` is within the last 14 days, subtract an additional 2 from `total` (freshness penalty — do this in the main loop, not in the subagent). Skip items whose final `total < 3`.

**Malformed `negativePrior`:** if the subagent omits `negativePrior` or returns a positive number, treat it as 0 (neutral) and log a one-line warning. Do NOT fall back to main-loop scoring just for this — the other rubric values are still usable.

**If a subagent response is malformed** (unparseable JSON, or any *required* field missing / out of range), fall back to main-loop scoring for that item. Log a one-line warning: "Scoring fallback for <title>: <reason>".

**Required fields** for fallback purposes are: `goalAlignment`, `usageGap`, `recency`, `effort`, `observation`, `recommendation`. `negativePrior` is explicitly **optional** — its absence is handled by the paragraph above and does not trigger fallback.

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

For items scoring 5+ (Act Now and Worth Exploring tiers), assemble one insight entry per item using the prose the scoring subagent already returned. No re-writing — the subagent's `observation` and `recommendation` go straight in. Append each to the catalogue's `insights` array:

```json
{
  "id": "insight-<timestamp>-<index>",
  "type": "recommendation",
  "observation": "<subagent observation>",
  "recommendation": "<subagent recommendation>",
  "evidence": ["score breakdown: goal=N, gap=N, recency=N, effort=N, negPrior=N, total=N"],
  "relatedItems": ["<item id>"],
  "createdAt": "<ISO date>",
  "status": "new"
}
```

**Note:** the `observation` and `recommendation` fields are the same strings the review UI renders inline on each card (via `insights[].relatedItems[0]` → item id lookup). Keep them grounded in the user's context, not generic.

### Step 6: Update Catalogue State

For each item that was recommended, update its properties:
- `lastRecommended`: today's ISO date
- `score`: the computed total score
- `scoreBreakdown`: `{ "goalAlignment": N, "usageGap": N, "recency": N, "effort": N, "negativePrior": N }` (where `negativePrior` is 0, -1, or -2)

Write the updated catalogue back to `~/.claude/radar/catalogue.json`.

### Step 7: Summary

Output a brief terminal summary:
- The top 2-3 "Act Now" recommendations (one line each)
- How many total recommendations across all tiers
- How many new insights were saved to the catalogue
