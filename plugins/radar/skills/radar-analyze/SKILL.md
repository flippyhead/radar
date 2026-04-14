---
name: radar-analyze
description: Analyze your Claude Code and Cowork session history to surface actionable workflow insights. Diagnoses failures, identifies automation opportunities, aligns time allocation with goals, and flags repeated knowledge worth saving.
argument-hint: [--days N]
---

# Radar Analyze

Analyze recent Claude Code and Cowork sessions to generate actionable workflow insights.

Uses the bundled workflow-analyzer for session parsing and enrichment. Claude does the reasoning.

## Arguments

- `$ARGUMENTS` — Optional:
  - `--days N` — How many days of history to analyze (default: 7)

Parse the days value from `$ARGUMENTS` if provided. Default to 7.

## Workflow

### Step 1: Parse & Enrich Session Data

Run the workflow-analyzer CLI to parse and enrich sessions from all configured sources (Claude Code + Cowork):

```bash
# Bundled binary (preferred)
node "${CLAUDE_PLUGIN_ROOT}/bin/workflow-analyzer/dist/cli.js" parse --since ${DAYS} --output /tmp/workflow-analyzer-parsed.json

# Fallback if bin/ not available:
# npx @flippyhead/workflow-analyzer@latest parse --since ${DAYS} --output /tmp/workflow-analyzer-parsed.json
```

If the command fails, surface the error output directly to the user. Do not swallow the error or exit silently.

Read the output file. It contains `{ sessions: [...], sessionGroups: [...] }`.

If sessions is empty, report "No activity in the last N days" and stop.

Otherwise, note the summary: how many sessions, which sources (claude-code, cowork), how many session groups.

### Step 2: Check Previous Insights

Read `~/.claude/radar/catalogue.json` and look at the `insights` array. Note:
- Insights with `status: "new"` — unresolved insights to avoid duplicating
- Insights with `status: "dismissed"` — things the user doesn't want to see again

Build a set of existing insight IDs and observation text to use for deduplication. If the catalogue doesn't exist, skip this step.

### Step 3: Check for User Goals

Read `~/.claude/CLAUDE.md` if it exists. Look for stated goals, priorities, or focus areas. These are used by the Decision Support analysis below.

If no goals are found, skip goal-based analysis.

### Step 4: Analyze

With all data gathered, analyze the parsed sessions and produce insights across four modules. For each insight, you MUST provide a concrete action — never just describe a problem without telling the user what to do about it.

**Module A — Root Cause Diagnosis:**

Look at tool failures in the session data. For each tool with a notable failure rate:
- Read the actual error messages (not just counts)
- Diagnose the root cause: is it an auth issue, config problem, API bug, user error, or transient?
- If fixable: provide the specific command or config change to fix it (`action type: run` or `action type: install`)
- If not fixable: acknowledge it so the user stops worrying (`action type: acknowledge`)
- Skip tools with very low failure counts (<3 calls) or very low failure rates (<20%)

**Module B — Direct Automation:**

Look for patterns that could be automated:
- **Permission confirmations**: Count short messages like "yes", "y", "a", "ok", "sure" that appear to be tool permission confirmations. If a specific tool triggers many confirmations, suggest an allowedTools config entry (`action type: install` with settings.json patch)
- **Repeated prompts**: Look at user messages across sessions for frequently typed prompts. If a prompt appears 5+ times, suggest creating a skill or alias (`action type: install` with skill content)
- **Repeated tool sequences**: Look for the same sequence of 3+ tool calls appearing across sessions. Suggest automation if a pattern repeats 5+ times.

**Module C — Decision Support:**

Using the session groups and any user goals from Step 3:
- Calculate time allocation by project/topic (sessions and minutes)
- Compare against stated goals — flag misalignments
- Note cross-platform patterns (e.g., "researched X in Cowork but never implemented in Claude Code")
- If a project is consuming disproportionate time without being in the goals, surface a decision (`action type: decide`)

**Module D — Knowledge Nudges:**

Look for repeated topics across sessions:
- Find user prompts that ask about the same thing in multiple sessions (sign the answer should be saved)
- Detect when the user provides the same context/background repeatedly at session start (should be in CLAUDE.md or memory)
- For repeated topics, generate a consolidated summary of what to save (`action type: save`)

### Insight Format

For each insight, produce:

```json
{
  "module": "root-cause | direct-automation | decision-support | knowledge-nudges",
  "severity": "alert | action | suggestion | info",
  "title": "One-line summary",
  "observation": "What the data shows (with specific numbers)",
  "diagnosis": "Why this is happening (optional)",
  "action": {
    "type": "install | run | save | review | decide | acknowledge"
  },
  "evidence": [{"metric": "specific numbers"}],
  "effort": "low | medium | high",
  "impact": "low | medium | high",
  "confidence": 0.0-1.0,
  "deduplicationKey": "unique-key-for-this-insight"
}
```

Action types:
- `install`: `{ type: "install", artifact: "filename", content: "file content to install" }`
- `run`: `{ type: "run", command: "command to run", explanation: "why" }`
- `save`: `{ type: "save", content: "what to save", destination: "CLAUDE.md or project memory" }`
- `review`: `{ type: "review", summary: "what to look at", links: [] }`
- `decide`: `{ type: "decide", question: "decision to make", options: ["option 1", "option 2"] }`
- `acknowledge`: `{ type: "acknowledge", message: "FYI only, no action needed" }`

Aim for 5-10 total insights. Prioritize high-impact/low-effort actions. Skip insights that duplicate existing insights from Step 2.

### Step 5: Save Insights

1. Write insights to a temp file and use the CLI to publish as a markdown report:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/workflow-analyzer/dist/cli.js" publish --insights /tmp/workflow-analyzer-insights.json
```

The insights JSON file should contain:
```json
{
  "insights": [...],
  "metadata": {
    "period": { "since": "ISO date", "until": "ISO date" },
    "sessionCount": N,
    "sources": ["claude-code", "cowork"],
    "modulesRun": ["root-cause", "direct-automation", "decision-support", "knowledge-nudges"]
  }
}
```

Write this file before running the publish command.

2. Append insights to `~/.claude/radar/catalogue.json`'s `insights` array. If the file or `~/.claude/radar/` directory doesn't exist:
   - First check for legacy files at `~/.claude/radar-catalogue.json` or `~/.claude/scout-catalogue.json`. If found, migrate using the same transformation as radar-scan Step 1 (see below).
   - If no legacy file exists, create the directory and initialize with: `{ "version": "1.0", "updatedAt": null, "items": [], "insights": [] }`.

   Convert each insight to the catalogue insight schema:

```json
{
  "id": "analyze-<deduplicationKey>",
  "type": "pattern",
  "observation": "<insight.observation>",
  "recommendation": "<describe the action>",
  "evidence": ["<insight.evidence metrics>"],
  "relatedItems": [],
  "createdAt": "<ISO date>",
  "status": "new"
}
```

### Step 6: Summary

Output a brief summary:
- How many insights were generated, by module
- The report period and session count (including Cowork if any)
- Top 2-3 "quick win" recommendations (highest impact, lowest effort)
