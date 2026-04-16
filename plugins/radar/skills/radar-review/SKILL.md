---
name: radar-review
description: Review your radar catalogue — browse, star, dismiss, annotate, and filter discovered tools and insights.
argument-hint: [--status <new|starred|all>] [--since <date>] [--category <name>]
---

# Radar Review — Catalogue Review Interface

Browse and manage your radar catalogue through conversation. Star items worth pursuing, dismiss noise, add notes, and filter by date, status, or category.

**This skill is self-contained — it does not depend on or use the Open Brain plugin, ai-brain MCP, or any external memory service. All data comes from local files.**

## Arguments

- `$ARGUMENTS` — Optional:
  - `--status <new|starred|reviewed|dismissed|acted-on|all>` — Filter by status (default: new)
  - `--since <date or "7d" or "30d">` — Show items discovered after this date
  - `--category <name>` — Filter by category
  - `--insights` — Show insights instead of catalogue items

Parse from `$ARGUMENTS` if provided. Default to `--status new`.

## Workflow

### Step 1: Load Catalogue

Read `~/.claude/radar/catalogue.json`. If it doesn't exist, tell the user: "No catalogue found. Run `/radar-scan` first to discover tools and techniques."

### Step 2: Filter and Display

Apply filters from arguments:
- `--status`: match item `status` field. `all` shows everything.
- `--since`: match items where `discoveredAt` is after the given date. Support relative formats: "7d" = 7 days ago, "30d" = 30 days ago.
- `--category`: match item `category` field.
- `--insights`: show the `insights` array instead of `items`.

If showing items, sort by `discoveredAt` descending (newest first). Group by category.

Display format for items:

```
## [Category Name] (N items)

1. ★ **[Title]** — [description]
   [url] | [source] | discovered [relative date]
   Status: [status] | Score: [score/10 or unscored]
   Notes: [count] | Last note: "[preview]"

2. **[Title]** — [description]
   ...
```

Use ★ prefix for starred items. Use ~~strikethrough~~ for dismissed items (only shown with `--status all`).

Number items sequentially (1, 2, 3...) for easy reference in commands.

Display format for insights:

```
## Insights (N total, M new)

1. **[type]** — [observation]
   Recommendation: [recommendation]
   Related items: [list]
   Status: [status] | Created: [date]
```

After displaying, show the available commands:

```
**Commands:** star <N>, dismiss <N>, reviewed <N>, acted-on <N>,
note <N> "<text>", show <status|category|starred|all>,
clear dismissed [--older-than 30d], add "<url>" [description]
```

### Step 3: Interactive Commands

Wait for user input. Process commands:

**Status changes:**
- `star <N or N-M or N,M,O>` — Set status to `starred`, set `reviewedAt` to now
- `dismiss <N or N-M or N,M,O>` — Set status to `dismissed`, set `reviewedAt` to now
- `reviewed <N or N-M or N,M,O>` — Set status to `reviewed`, set `reviewedAt` to now
- `acted-on <N or N-M or N,M,O>` — Set status to `acted-on`, set `reviewedAt` to now

**Annotations:**
- `note <N> "<text>"` — Append `{ "at": "<now>", "text": "<text>" }` to the item's `notes` array

**Navigation:**
- `show new` / `show starred` / `show all` / `show dismissed` — re-filter and display
- `show <category>` — filter by category name
- `show insights` — switch to insights view

**Maintenance:**
- `clear dismissed` — Remove items with status `dismissed` that were reviewed more than 30 days ago
- `clear dismissed --older-than <N>d` — Custom age threshold
- `add "<url>"` — Add a new item with `source: "manual"`, `status: "new"`. Optionally include a description after the URL.

**Bulk natural language:**
The user may also give natural-language instructions like "dismiss everything from YouTube" or "star all the MCP items". Interpret these and apply the appropriate status changes.

After each command, write the updated catalogue to `~/.claude/radar/catalogue.json`, confirm the action briefly, and re-display the current filtered view.

### Step 4: Summary on Exit

When the user is done (moves on to another topic or says "done"), output a brief summary of changes made this session:
- Items starred: N
- Items dismissed: N
- Items reviewed: N
- Notes added: N
- Items added: N
