# Brain Sync Skill Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `/brain-sync` skill that syncs the current project's context into the AI Brain MCP.

**Architecture:** Pure SKILL.md skill (no scripts). Claude reads project files, searches the brain for existing knowledge, diffs, and captures only new/changed information via `capture_thought`.

**Tech Stack:** SKILL.md (YAML frontmatter + markdown instructions), AI Brain MCP tools (`search_thoughts`, `capture_thought`)

---

## Chunk 1: Create the SKILL.md

### Task 1: Create the brain-sync SKILL.md

**Files:**
- Create: `skills/brain-sync/SKILL.md`

**Reference:** Design spec at `docs/superpowers/specs/2026-03-13-brain-sync-design.md`

- [ ] **Step 1: Create the SKILL.md file**

Create `skills/brain-sync/SKILL.md` with the following content:

```markdown
---
name: brain-sync
description: Sync the current project's context into your AI Brain. Reads project files, compares against existing brain knowledge, and captures only new or changed information.
argument-hint: [--name <project-name>]
---

# Brain Sync

Sync the current project's context into the AI Brain so future conversations have up-to-date knowledge about this project.

## Arguments

- `$ARGUMENTS` — Optional:
  - `--name <project-name>` — Override the auto-derived project name

Parse the name value from `$ARGUMENTS` if provided.

## Workflow

### Step 1: Gather Project Context

Read the following from the current working directory. Skip any that don't exist.

**Project identity:**
- `README.md`
- `package.json`, `Cargo.toml`, `pyproject.toml`, or `go.mod` (whichever exists)
- `CLAUDE.md`

**Git state:**
- Run `git branch --show-current`
- Run `git log --oneline -20`
- Run `gh pr list --limit 10` (skip if `gh` is unavailable)

**Project structure:**
- Run `ls -la` at the project root

**Strategic context:**
- If `docs/` exists, list its contents and selectively read files that reveal project direction (specs, architecture docs, roadmaps). Do not read every file.
- Read `GOALS.md`, `TODO.md`, or similar planning files if they exist.

### Step 2: Derive Project Name

If `--name` was provided, use that. Otherwise, derive the project name using this precedence:

1. The `name` field from `package.json` / `Cargo.toml` / `pyproject.toml`
2. The first heading in `README.md`
3. The current directory name (fallback)

### Step 3: Search Brain for Existing Knowledge

Call `mcp__ai-brain__search_thoughts` with:
- `query`: the project name
- `limit`: 10

Review the results to understand what the brain already knows about this project.

### Step 4: Synthesize and Diff

Compare the current project state (from Step 1) against existing brain thoughts (from Step 3):

- Identify information that is **new** (not in any existing thought)
- Identify information that has **changed** (contradicts or updates an existing thought)
- Identify information that is **unchanged** (already accurately captured)

### Step 5: Sync to Brain

Based on the diff from Step 4:

**First sync** (no existing thoughts found):
Capture a comprehensive project summary via `mcp__ai-brain__capture_thought`. Structure the content with the project name first. Example format:

```
Project: <name> — <one-line description>. Tech stack: <technologies>. Key features: <features>. Current status: <status>. Next steps: <direction>.
```

If the summary would be excessively long, split into 2-3 focused thoughts (e.g., project overview, current status/roadmap).

**Subsequent syncs** (existing thoughts found):
Only capture thoughts for meaningful changes. Frame each as an update:

```
Update: <project-name> — <what changed> (<date>). <new status or direction>.
```

Skip unchanged information. If nothing meaningful has changed, do not capture any thoughts.

**No changes:**
Tell the user the brain is already up to date and skip to Step 6.

### Step 6: Report to User

Briefly tell the user:
- What was synced (or that everything was already current)
- How many new thoughts were captured
- Key highlights of what changed
```

- [ ] **Step 2: Verify the file exists and frontmatter is valid**

Run: `head -5 skills/brain-sync/SKILL.md`
Expected: YAML frontmatter with `name: brain-sync`, `description:`, and `argument-hint:`

- [ ] **Step 3: Commit**

```bash
git add skills/brain-sync/SKILL.md
git commit -m "feat: add brain-sync skill for syncing project context to AI Brain"
```

### Task 2: Smoke test the skill

- [ ] **Step 1: Verify skill is discoverable**

The skill should appear in the skills list since plugins discover skills by convention from the `skills/` directory. Verify the file is in the right location:

Run: `ls skills/*/SKILL.md`
Expected: Both `skills/brain-sync/SKILL.md` and `skills/workflow-analyst/SKILL.md` listed

- [ ] **Step 2: Manual test**

Invoke `/brain-sync` in a project directory and verify it:
1. Reads project files without errors
2. Searches the brain for existing thoughts
3. Either captures new thoughts or reports "already up to date"
4. Reports results to the user
