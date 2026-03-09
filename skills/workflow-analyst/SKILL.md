---
name: workflow-analyst
description: Analyze your Claude Code session history to surface workflow insights, underused features, anti-patterns, and automation opportunities. Run weekly or on-demand.
argument-hint: [--days N]
---

# AI Workflow Analyst

Analyze recent Claude Code sessions to generate actionable workflow insights.

## Arguments

- `$ARGUMENTS` — Optional:
  - `--days N` — How many days of history to analyze (default: 7)

Parse the days value from `$ARGUMENTS` if provided. Default to 7.

The skill's base directory is provided at the top when this skill is loaded (e.g., "Base directory for this skill: /path/to/..."). Use that path as `SKILL_DIR` in all commands below.

## Workflow

### Step 1: Parse Session Data

Run the session parser to extract structured data from recent sessions:

```bash
node ${SKILL_DIR}/parse-sessions.mjs --days ${DAYS} --output /tmp/workflow-analyst-sessions.json
```

Then run the history parser:

```bash
node ${SKILL_DIR}/parse-history.mjs --days ${DAYS} > /tmp/workflow-analyst-history.json
```

Read both output files. If totalSessions === 0, report "No activity in the last N days" to the user and stop.

### Step 1b: Refresh Ecosystem Cache

Run the ecosystem cache refresh script. Pass the session and history data files so it can infer tech stack and prompt themes:

```bash
node ${SKILL_DIR}/refresh-ecosystem.mjs \
  --sessions-json /tmp/workflow-analyst-sessions.json \
  --history-json /tmp/workflow-analyst-history.json
```

This writes the ecosystem cache to `/tmp/workflow-analyst-ecosystem-cache.json`. If the script fails, skip ecosystem discovery in Step 4 and continue with the rest of the analysis.

### Step 2: Research Latest Capabilities

Use web search to find the latest Claude Code features and tips. Run these searches:

1. "Claude Code new features changelog 2026"
2. "Claude Code tips best practices"
3. "Anthropic Claude Code release notes"

Summarize findings as a list of capabilities and tips. Note any features released in the last 30 days.

If web search is unavailable, skip this step and note it in the report.

### Step 3: Check Previous Insights

Use the `get_insights` MCP tool to check for existing insights:

1. Call `get_insights` with `status: "new"` — find unresolved insights to avoid repeating
2. Call `get_insights` with `status: "noted"` — find acknowledged but not-yet-acted-on insights
3. Call `get_insights` with `status: "dismissed"` — find what the user doesn't want to see again

Also search the AI Brain for user preferences using `search_thoughts` with query: "User Preference workflow" to understand the user's environment and exclusions.

Note which insights are still open and which categories have been frequently dismissed so you don't repeat them.

If the `get_insights` MCP tool is unavailable, fall back to `search_thoughts` with query: "workflow insight claude code".

### Step 4: Analyze

With all data gathered, produce insights in five categories. Be specific and actionable — reference actual numbers from the parsed data.

**Feature Discovery:**
- Compare tool usage stats against known Claude Code tools (Read, Edit, Write, Glob, Grep, Bash, Agent, NotebookEdit, WebFetch, WebSearch, Skill, TaskCreate, TaskUpdate, etc.)
- Identify tools that were never or rarely used
- Check if Bash was used for things that dedicated tools handle:
  - `grep`/`rg` commands in Bash → should use Grep tool
  - `cat`/`head`/`tail` commands in Bash → should use Read tool
  - `find`/`ls` commands in Bash → should use Glob tool
  - `sed`/`awk` commands in Bash → should use Edit tool
- Cross-reference with newly announced features from Step 2

**Workflow Anti-Patterns:**
- Tools with high failure rates (failures / calls > 30%)
- Permission denials — which tools and how often
- Retry sequences — same tool called multiple times in a row after failure
- Look for specific anti-pattern evidence in the session data

**Productivity Patterns:**
- Sessions per project — which projects get the most attention
- Time-of-day distribution — when the user is most active
- Average session duration
- Model usage breakdown
- Total user messages and tool calls across all sessions

**Automation Opportunities:**
- Frequently typed prompts from history (candidates for skills or aliases)
- Slash commands used most often
- Patterns that could become hooks, skills, or scheduled tasks
- Suggest specific skill names for repeated prompt patterns

**Ecosystem Discovery:**
- Read `/tmp/workflow-analyst-ecosystem-cache.json`
- For available plugins not installed: check if the plugin's name or tags match the user's tech stack or prompt themes. Only recommend if there's a clear relevance match.
- For installed plugins: check if a newer version is available by comparing install-counts-cache data
- For MCP servers: report any in `failed` or `needsAuth` status from the cache's `mcpServerHealth`
- For MCP servers in the registry but not installed: recommend only if they match the user's tech stack or prompt themes
- Cross-reference against dismissed ecosystem insights from Step 3 to avoid repeating
- Produce 2-4 ecosystem insights, prioritized by: (1) broken/needs-auth MCP servers, (2) high-install plugins matching usage patterns, (3) plugin updates available

For each insight, produce:
- **Category**: feature-discovery | anti-pattern | productivity | automation | ecosystem
- **Observation**: What the data shows (include specific numbers)
- **Recommendation**: Specific, actionable advice
- **Evidence**: The numbers/data supporting the observation

Aim for 5-10 total insights. Prioritize by impact.

### Step 5: Publish to AI Brain

Call the `create_report` MCP tool with:

- Report metadata: startDate, endDate, sessionsAnalyzed, totalPrompts, totalToolCalls, projectsActive, modelUsage
- Array of insights, each with: category, observation, recommendation, evidence

If the `create_report` MCP tool is unavailable, fall back to saving individual insights via `capture_thought`.

### Step 6: Summary

After publishing, output a brief summary to the user:
- How many insights were generated
- The report period
- Direct them to the /insights page in the AI Brain web UI to review and provide feedback
- Top 1-2 "quick win" recommendations
