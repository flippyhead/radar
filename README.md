# Workflow Analyst — Claude Code Plugin

Analyze your Claude Code session history to surface actionable workflow insights.

## What it does

Parses your recent Claude Code sessions and produces insights in five categories:

- **Feature Discovery** — tools you're not using, Bash commands that have dedicated tools
- **Anti-Patterns** — high failure rates, permission denials, retry loops
- **Productivity** — session stats, project breakdown, time-of-day patterns
- **Automation** — repeated prompts that could become skills or hooks
- **Ecosystem** — plugins, MCP servers, and skills you'd benefit from based on your tech stack and usage

## Install

```bash
# Add the marketplace
/plugin marketplace add flippyhead/claude-workflow-analyst

# Install the plugin
/plugin install workflow-analyst@claude-workflow-analyst
```

## Usage

```
/workflow-analyst
/workflow-analyst --days 14
```

## AI Brain Integration

If you have an [AI Brain](https://github.com/flippyhead/ai-brain) MCP server connected, insights are automatically published as structured reports with feedback controls (noted/done/dismissed).

Without AI Brain, insights are saved via `capture_thought` or output directly.

## License

MIT
