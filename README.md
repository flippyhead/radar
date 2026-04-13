# Radar

Your AI development radar. Analyzes your coding sessions, scans the ecosystem, and tells you what matters — based on what you actually do.

Works with Claude Code. Zero setup. All data stays local.

## Install

```bash
/plugin marketplace add flippyhead/radar
/plugin install radar@flippyhead/radar
```

## Commands

| Command | What it does |
|---------|-------------|
| `/radar` | Scan ecosystem + get personalized recommendations |
| `/radar-analyze` | Analyze your recent coding sessions for workflow insights |
| `/radar-scan` | Scan HN, GitHub, YouTube, Anthropic, and your dependencies for new tools |
| `/radar-recommend` | Match discoveries against your usage patterns |
| `/radar-review` | Browse, star, dismiss, and annotate your catalogue |

## How It Works

**Scan** — Radar pulls from Hacker News, GitHub, YouTube, the Anthropic changelog, and your project dependencies. It builds a local catalogue of AI tools, MCP servers, features, and techniques.

**Analyze** — Parses your Claude Code session history to find tool failures, automation opportunities, time allocation patterns, and repeated knowledge worth saving.

**Recommend** — Matches catalogue entries against your actual usage patterns, installed tools, and active projects. Scores each item on goal alignment, usage gap, recency, and effort/impact.

**Review** — Conversational interface to manage your catalogue. Star things to try, dismiss noise, add notes, filter by date or category.

## Data

Everything lives in `~/.claude/radar/catalogue.json` — a single JSON file you own. No accounts, no servers, no external dependencies.

The catalogue schema is stable and documented. Future adapter plugins can sync it to Notion, Linear, ClickUp, or any other system.

## Upgrading

From `claude-workflow-analyst`:

```bash
/plugin marketplace remove flippyhead/claude-workflow-analyst
/plugin marketplace add flippyhead/radar
```

Radar automatically migrates your existing catalogue on first run.

## License

MIT
