# Radar

Your AI development radar. Watches your sessions, scans the ecosystem, and recommends what matters to you.

Ships two plugins:
- **Radar** — workflow intelligence for Claude Code and Cowork
- **Open Brain** — persistent AI memory across sessions

## Quick Start

```bash
# Install both plugins (one command)
/plugin marketplace add flippyhead/radar

# Try it
/radar-analyze
```

## Commands

### Radar (workflow intelligence)

| Command | What it does |
|---------|-------------|
| `/radar` | Scan ecosystem + recommend improvements (combined) |
| `/radar-analyze` | Analyze your recent coding sessions |
| `/radar-scan` | Scan external sources for new tools and techniques |
| `/radar-recommend` | Get personalized recommendations from your catalogue |

### Open Brain (persistent memory)

| Command | What it does |
|---------|-------------|
| `/brain-init` | Set up your brain from connected tools |
| `/brain-sync` | Sync current project to your brain |
| `/weekly-review` | Weekly synthesis of your work and goals |

## How They Work Together

Radar works standalone — session analysis and ecosystem scanning run in terminal-only mode with zero setup.

Connect [Open Brain](https://ai-brain-pi.vercel.app) for cross-session memory: persistent catalogue, goal-aware recommendations, and weekly reviews.

## Install Individually

```bash
# Just workflow intelligence
/plugin install radar@flippyhead/radar

# Just persistent memory
/plugin install open-brain@flippyhead/radar
```

## Upgrading from `claude-workflow-analyst`?

```bash
/plugin marketplace remove flippyhead/claude-workflow-analyst
/plugin marketplace add flippyhead/radar
```

Your Open Brain data is unchanged — it lives on the server, not in the plugin.

## License

MIT
