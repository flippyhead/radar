# Claude Workflow Analyst — Plugin Marketplace

Two plugins for building your personal AI memory layer and analyzing your workflow.

## Plugins

### Open Brain

Your personal AI memory layer — zero-input onboarding, project sync, and weekly reviews.

```bash
/plugin install open-brain@claude-workflow-analyst
```

**Skills:**
- `/brain-init` — Bootstrap your brain from connected tools (email, calendar, ClickUp, GitHub, etc.) and Claude's memory. No manual data entry.
- `/brain-sync` — Sync the current project's context into your brain. Compares against existing knowledge and captures only changes.
- `/weekly-review` — Weekly synthesis of your thoughts, workflow insights, and goals. Surfaces gaps, open loops, and recommendations.

**Includes:** Open Brain MCP connector (auto-configured on install).

### Workflow Analyst

Analyze your Claude Code and Cowork session history for actionable insights.

```bash
/plugin install workflow-analyst@claude-workflow-analyst
```

**Skills:**
- `/workflow-analyst` — Parses recent sessions and produces insights: root cause diagnosis, automation opportunities, goal alignment, knowledge nudges.

**Works standalone.** Enhanced when Open Brain is connected (insights stored with feedback controls, goal comparison, deduplication).

## Install

```bash
# Add the marketplace (one time)
/plugin marketplace add flippyhead/claude-workflow-analyst

# Install one or both plugins
/plugin install open-brain@claude-workflow-analyst
/plugin install workflow-analyst@claude-workflow-analyst
```

## AI Brain

Both plugins integrate with [Open Brain](https://ai-brain-pi.vercel.app) — a personal AI memory layer. Sign up at the link, then the MCP connector is configured automatically when you install either plugin.

## License

MIT
