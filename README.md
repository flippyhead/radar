# Radar

Your AI development radar for Claude Code.

The AI tooling landscape changes every week. New Claude Code features ship, your dependencies release major versions, MCP servers multiply, and frameworks you depend on pivot — all while you're heads-down shipping.

Radar watches the ecosystem for you. It scans your dependencies, Hacker News, GitHub, and the Anthropic changelog, then tells you what actually matters — based on your projects, your tools, and your goals.

## Install

```bash
/plugin marketplace add flippyhead/radar
/plugin install radar@flippyhead/radar
```

Works with Claude Code. Zero setup. All data stays local.

## What You Get

### Ecosystem scan + personalized recommendations

Run `/radar` to scan external sources and get scored recommendations matched to your workflow:

```
Scan complete: 12 new items catalogued
  — 3 from Anthropic changelog
  — 6 from dependency changelogs (57 releases across 16 repos)
  — 3 from AI ecosystem news

Recommendations:

▸ Act Now

  1. Claude Code 1-hour prompt caching — Score: 9/10
     ENABLE_PROMPT_CACHING_1H env var. With 55 sessions/week you're
     burning through API cache. One env var, immediate cost/speed benefit.
     → Next step: Add to your settings.json env block.

  2. @posthog/ai v7.16.0 — Score: 7/10
     New AI-specific analytics package. You're already using PostHog.
     Could give you token usage, model performance, and cost tracking.
     → Next step: Check @posthog/ai docs, evaluate for your AI features.

▸ Worth Exploring

  3. Drizzle ORM v1.0.0-beta.21 — Score: 6/10
     Approaching 1.0 stable. Validators consolidated into core.
     You use Drizzle — don't upgrade to beta in prod, but track it.

  4. AI SDK v7 beta — Score: 5/10
     Progressing but not stable. Stay on v6, monitor for GA.

▸ FYI — Market Context

  Cursor hit $2B ARR. Claude Code tied at 18% developer adoption.
  The AI coding tool market is converging on the agent paradigm.
```

Every recommendation is scored on **goal alignment**, **usage gap**, **recency**, and **effort/impact** — using your actual session data, not generic advice.

### Workflow insights from your sessions

Run `/radar-analyze` to parse your Claude Code session history and surface patterns you'd never notice yourself:

```
Analyzed 55 sessions (7 days), 8,596 tool calls across 6 projects.

Insights:

  ⚡ Direct Automation
  You said "yes" or "ok" 70 times this week — likely permission
  confirmations. Check which MCP tools trigger these and add them
  to allowedTools.
  Effort: low | Impact: medium

  ⚡ Direct Automation
  /fix-pr-reviews was invoked 71 times. The skill supports
  "/loop 10m /fix-pr-reviews" for automatic monitoring — you're
  doing it manually.
  Effort: low | Impact: medium

  📊 Decision Support
  Top 3 projects by time: copa-fyi (22 sessions), consumer-bot (15),
  already-app (14). Your strategic priority says "Consolidate" but
  you're actively working 4+ projects. Time for a prioritization call?
  Effort: low | Impact: high
```

Insights are categorized by module — **root cause diagnosis**, **direct automation**, **decision support**, and **knowledge nudges** — each with concrete next steps.

### Manage your catalogue

Run `/radar-review` to browse discoveries and insights conversationally. Star things worth pursuing, dismiss noise, add notes, filter by status or category. Your catalogue grows smarter over time as Radar learns what you care about.

## How It Works

- **Scan** — pulls from dependency changelogs across all your local projects, Hacker News, GitHub trending, Anthropic changelog, and YouTube. Deduplicates against your existing catalogue.
- **Score** — matches each discovery against your installed tools, active projects, and stated goals. Weighted scoring on goal alignment, usage gap, recency, and effort/impact.
- **Persist** — everything goes to `~/.claude/radar/catalogue.json`. Single local JSON file, you own it. No accounts, no servers, no external dependencies. Future adapter plugins can sync to Notion, Linear, or anywhere else.

## Commands

| Command | What it does |
|---------|-------------|
| `/radar` | Scan ecosystem + get personalized recommendations |
| `/radar-analyze` | Analyze your recent coding sessions for workflow insights |
| `/radar-scan` | Scan external sources only (no recommendations) |
| `/radar-recommend` | Score and recommend from existing catalogue |
| `/radar-review` | Browse, star, dismiss, and annotate your catalogue |

## Upgrading

From `claude-workflow-analyst`:

```bash
/plugin marketplace remove flippyhead/claude-workflow-analyst
/plugin marketplace add flippyhead/radar
```

Radar migrates your existing catalogue when you first run `/radar-scan` or `/radar`.

## License

MIT
