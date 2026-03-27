---
name: weekly-review
description: Weekly synthesis of your brain thoughts, workflow insights, and goals. Surfaces gaps, open loops, and recommendations.
---

# Weekly Review

A weekly synthesis that cross-references your brain thoughts, workflow insights, and goals to surface what you'd miss looking at any one source alone.

## Workflow

### Step 1: Gather Data

Collect from the brain using MCP tools. Each source is optional — work with whatever is available.

**Recent thoughts:**
Call `mcp__ai-brain__browse_recent` to get thoughts from the past 7 days.

**Workflow insights:**
Call `mcp__ai-brain__get_insights` with `status: "new"` and then `status: "noted"` to get unresolved workflow insights. If the `mcp__ai-brain__get_insights` tool is unavailable (radar plugin not installed), note this and skip insight-dependent sections.

**Goals and priorities:**
Call `mcp__ai-brain__get_lists` with `pinned: true` to get the user's stated goals and priorities.

**Open items:**
Call `mcp__ai-brain__get_open_items` to get unfinished tracked items across all lists.

If the brain is empty or unreachable, tell the user: "Your brain doesn't have enough data for a meaningful review yet. Try capturing some thoughts first, or run `/brain-init` to bootstrap from your connected tools."

### Step 2: Produce the Review

Generate a report with these 5 sections. Each section should be concise — the entire review should be scannable in 2 minutes.

---

**This Week in 30 Seconds**

2-3 sentence headline summary. What was the dominant theme? What stands out?

---

**Attention vs. Intention**

Compare workflow insights (what you actually did) against pinned goals (what you intended to do).

Flag:
- Goals with no corresponding session activity — "You said [goal] is a priority but had no sessions related to it"
- Heavy activity on topics not in your goals — "[Topic] consumed [X]% of sessions but isn't in your goals"
- Momentum shifts — "[Topic] went from [X]% to [Y]% of sessions week over week"

If no workflow insights are available, display instead:
> "Install the `radar` plugin (`/plugin install radar@flippyhead/radar`) for time allocation analysis."

---

**Knowledge Captured**

Review the themes from saved thoughts this week.

Highlight:
- Topics with workflow insights but no saved thoughts — "You worked on [topic] but didn't save any knowledge about it — is there something worth persisting?"
- Repeated thought topics — building momentum on a theme
- Cross-domain connections — thoughts from different contexts that might be related

---

**Open Loops**

Aggregate unfinished threads from all sources:
- Open items from pinned lists (via `get_open_items`)
- Workflow insights still marked "new" — recommendations not yet acted on
- Decisions mentioned in thoughts that lack clear resolution

---

**Next Week**

2-3 specific, actionable recommendations based on the above. Be forward-looking, not retrospective. Reference specific projects, people, or decisions when possible.

---

### Step 3: Offer to Save

After presenting the review, ask:
"Want me to save a summary of this review to your brain? This helps track trends across weeks."

If yes, save a condensed version via `mcp__ai-brain__capture_thought` with format:
"Weekly review (week of [date]): [2-3 sentence summary of key themes, attention vs. intention highlights, and top recommendation]."
