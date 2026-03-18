---
name: workflow-analyst
description: Analyze your Claude Code and Cowork session history to surface actionable workflow insights. Diagnoses failures, identifies automation opportunities, aligns time allocation with goals, and flags repeated knowledge worth saving.
argument-hint: [--days N]
---

# AI Workflow Analyst

Analyze recent Claude Code and Cowork sessions to generate actionable workflow insights.

Uses the `@flippyhead/workflow-analyzer` npm package for session parsing and enrichment. Claude does the reasoning.

## Arguments

- `$ARGUMENTS` — Optional:
  - `--days N` — How many days of history to analyze (default: 7)

Parse the days value from `$ARGUMENTS` if provided. Default to 7.

## Workflow

### Step 1: Parse & Enrich Session Data

Run the workflow-analyzer CLI to parse and enrich sessions from all configured sources (Claude Code + Cowork):

```bash
npx @flippyhead/workflow-analyzer@latest parse --since ${DAYS} --output /tmp/workflow-analyzer-parsed.json
```

Read the output file. It contains `{ sessions: [...], sessionGroups: [...] }`.

If sessions is empty, report "No activity in the last N days" and stop.

Otherwise, note the summary: how many sessions, which sources (claude-code, cowork), how many session groups.

### Step 2: Check Previous Insights

Use the `get_insights` MCP tool to check for existing insights:

1. Call `get_insights` with `status: "new"` — unresolved insights
2. Call `get_insights` with `status: "noted"` — acknowledged but not acted on
3. Call `get_insights` with `status: "dismissed"` — things the user doesn't want to see again

Note which deduplication keys and categories to avoid repeating. If the MCP tool is unavailable, skip this step.

### Step 3: Fetch User Goals

Call `get_lists` with `pinned: true` to load the user's current priorities and goals. These are used by the Decision Support analysis below.

If unavailable, skip goal-based analysis.

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

Using the session groups and the user's pinned goals from Step 3:
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
- `save`: `{ type: "save", content: "what to save", destination: "AI Brain / CLAUDE.md / etc" }`
- `review`: `{ type: "review", summary: "what to look at", links: [] }`
- `decide`: `{ type: "decide", question: "decision to make", options: ["option 1", "option 2"] }`
- `acknowledge`: `{ type: "acknowledge", message: "FYI only, no action needed" }`

Aim for 5-10 total insights. Prioritize high-impact/low-effort actions. Skip insights that match dismissed deduplication keys from Step 2.

### Step 5: Publish

Write insights to a temp file and use the CLI to publish:

```bash
npx @flippyhead/workflow-analyzer@latest publish --insights /tmp/workflow-analyzer-insights.json
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

Write this file before running the publish command. If publish fails, fall back to saving insights via `create_report` or `capture_thought` MCP tools.

### Step 6: Summary

Output a brief summary:
- How many insights were generated, by module
- The report period and session count (including Cowork if any)
- Top 2-3 "quick win" recommendations (highest impact, lowest effort)
- Direct the user to /insights in the AI Brain web UI to review and provide feedback
