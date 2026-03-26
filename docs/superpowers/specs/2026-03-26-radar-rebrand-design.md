# Radar Rebrand & Release Readiness

**Date:** 2026-03-26
**Status:** Draft

## Problem

The `claude-workflow-analyst` repo ships two plugins (`workflow-analyst` and `open-brain`) with unclear naming, a confusing two-plugin install story, Claude-specific branding that limits future platform expansion, and reliability rough edges that would frustrate new users. The project needs a coherent identity and polished experience for broader adoption.

## Goals

1. Personal daily-driver quality — the author trusts it completely
2. Clear value proposition for power users (Claude Code + Cowork) and mainstream users
3. Platform-neutral identity that works for future Codex/Cursor distribution
4. Single install for the full experience, individual installs for just one plugin

## Non-Goals

- Cross-platform skill authoring (future concern, not this release)
- Automated migration tooling for existing users (user base is small)
- New features beyond what's needed for the restructure

---

## Part 1: Identity and Naming

### Repo

- GitHub repo renamed from `flippyhead/claude-workflow-analyst` to `flippyhead/radar`
- Marketplace identifier becomes `flippyhead/radar`

### Two Plugins, One Repo

The repo ships two plugins with distinct audiences and value propositions:

**Radar** — AI workflow intelligence. Analyzes coding sessions, scans the ecosystem for new tools and techniques, and recommends improvements relevant to you. Target: power users of Claude Code, Cowork, and eventually other AI coding tools.

**Open Brain** — Persistent AI memory. Lists, thoughts, project sync, weekly reviews. Target: anyone who wants cross-session memory, including non-technical users.

These are separate plugins because someone may want brain without radar (personal memory, no workflow analysis) or radar without brain (workflow analysis with terminal-only output).

### Install Commands

```bash
# Full experience (both plugins)
/plugin marketplace add flippyhead/radar

# Just workflow intelligence
/plugin install radar@flippyhead/radar

# Just persistent memory
/plugin install open-brain@flippyhead/radar
```

### Platform Neutrality

No `claude-` prefix on any product-facing name. "Radar" and "Open Brain" are platform-neutral identities. Claude Code is the first distribution channel; platform-specific packaging (`.claude-plugin/`, future `.codex/`, etc.) is a distribution concern, not a product identity concern.

---

## Part 2: Skill Naming and Command Surface

### Radar Plugin Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| radar | `/radar` | Combined: scan external sources then recommend. The default entry point. |
| radar-analyze | `/radar-analyze` | Parse Claude Code and Cowork sessions, surface actionable insights |
| radar-scan | `/radar-scan` | Scan external sources (Anthropic, HN, GitHub, YouTube, dependency changelogs), build catalogue |
| radar-recommend | `/radar-recommend` | Match catalogue against personal context, surface personalized recommendations |

**Why separate scan and recommend:** Different scheduling cadences. Scan can run daily via cron. Recommend may run weekly or on-demand. The combined `/radar` command exists for the common case of wanting both in one shot.

**Argument consistency:**
- `--days N` — lookback window (all skills)
- `--focus <category>` — category filter (recommend, scan)
- `--sources <all|feeds|manual>` — source filter (scan only)

### Open Brain Plugin Skills (Unchanged)

| Skill | Command | Purpose |
|-------|---------|---------|
| brain-init | `/brain-init` | Bootstrap brain from connected tools and Claude memory |
| brain-sync | `/brain-sync` | Sync current project context to brain |
| weekly-review | `/weekly-review` | Weekly synthesis of thoughts, insights, and goals |

---

## Part 3: Brain as Optional Enhancement

### Principle

Every radar skill works without brain. Brain adds persistence, cross-session history, and richer recommendations.

### Behavior Per Skill

| Skill | Without Brain | With Brain |
|-------|--------------|------------|
| `/radar-analyze` | Parses sessions, prints insights to terminal | Also publishes insights via `create_report`, checks for duplicates via `get_insights` |
| `/radar-scan` | Scans sources, prints catalogue to terminal, stores locally at `~/.claude/radar-catalogue.json` | Also stores catalogue in `[Scout]` brain lists, deduplicates across runs |
| `/radar-recommend` | Matches catalogue against environment + session history | Also loads goals and recent thoughts, publishes recommendations as insights |
| `/radar` | Runs scan then recommend in terminal-only mode | Full brain-enhanced pipeline |

### Detection

Skills check for brain availability by attempting a lightweight MCP call (`get_stats`) at the start. If it fails, proceed in terminal-only mode. No env var checking in the skill — that's the MCP layer's job.

### Messaging

- **Without brain:** Clean terminal output, no "brain unavailable" warnings. Just works.
- **With brain:** Subtle note at the end: "Insights also saved to your brain."
- **Brain-specific skills** (`brain-init`, `brain-sync`, `weekly-review`): Fail clearly with: "This skill requires Open Brain. Set up at https://ai-brain-pi.vercel.app"

---

## Part 4: Reliability Fixes

### Must Fix (P0)

**1. Silent failures → clear messages.**
All skills that interact with brain, external APIs, or the workflow-analyzer CLI must surface failures clearly:
- Brain unavailable: "Brain not connected, running in terminal-only mode"
- GitHub rate limited: "GitHub API rate limited — scanned 12 of 47 dependencies. Set GITHUB_TOKEN for full scanning."
- MCP tool missing: "Required MCP tool [name] not available. Check your plugin installation."
- CLI not found: "workflow-analyzer CLI not found. Run: npm install -g @flippyhead/workflow-analyzer"

**2. Hook timeout fix.**
The SessionStart hook (`check-brain-status.mjs`) makes 3 sequential fetches with 4s individual timeouts inside a 15s total timeout. Reduce to a single health-check fetch with a 5s timeout. The hook's job is detection, not full initialization.

**3. Local catalogue initialization.**
On first run without brain, `/radar-scan` must create `~/.claude/radar-catalogue.json` automatically. No manual setup required.

**4. Version sync enforcement.**
Add a comment block at the top of each version file pointing to the other two locations. Consider a simple shell script (`scripts/bump-version.sh`) that updates all three.

### Should Fix (P1)

**5. GitHub token guidance.**
When `GITHUB_TOKEN` is not set and scan-deps runs, print a one-line message explaining the rate limit and how to fix it.

**6. First-run detection.**
The SessionStart hook should detect if this is the user's first session after install (no previous analysis results, no catalogue file). If so, suggest: "Welcome to Radar. Try `/radar-analyze` to get started."

**7. Scout deduplication within a single run.**
Deduplicate URLs across sources within a single scan run, not just against the existing catalogue.

### Nice to Have (P2)

**8. `browse_recent` date filtering.**
Flag as an Open Brain API enhancement. Don't block this release on it.

**9. Insight deduplication key schema.**
Define a formal format: `{module}:{category}:{hash}` to prevent cross-module collisions.

---

## Part 5: Repo Structure

### Current → Proposed

```
radar/                                  ← repo root (renamed from claude-workflow-analyst)
├── .claude-plugin/
│   ├── plugin.json                     ← root: "radar" v3.0.0
│   └── marketplace.json               ← lists: radar (3.0.0) + open-brain (2.0.0)
├── plugins/
│   ├── radar/                          ← renamed from workflow-analyst/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json            ← v3.0.0
│   │   ├── .mcp.json                  ← ai-brain (used when available)
│   │   └── skills/
│   │       ├── radar/
│   │       │   └── SKILL.md           ← NEW: combined scan + recommend
│   │       ├── radar-analyze/
│   │       │   └── SKILL.md           ← renamed from workflow-analyst
│   │       ├── radar-scan/
│   │       │   └── SKILL.md           ← renamed from scout
│   │       └── radar-recommend/
│   │           └── SKILL.md           ← renamed from discover
│   └── open-brain/
│       ├── .claude-plugin/
│       │   └── plugin.json            ← v2.0.0 (major: new first-run hook behavior)
│       ├── .mcp.json
│       ├── hooks/
│       │   ├── hooks.json
│       │   └── check-brain-status.mjs ← updated: single fetch, first-run detection
│       └── skills/
│           ├── brain-init/
│           │   └── SKILL.md
│           ├── brain-sync/
│           │   └── SKILL.md
│           └── weekly-review/
│               └── SKILL.md
├── scripts/
│   └── bump-version.sh               ← NEW: updates all 3 version locations
├── README.md                          ← rewritten
├── CLAUDE.md                          ← updated for new structure
└── docs/
```

### Key Changes

- `plugins/workflow-analyst/` → `plugins/radar/`
- All skill directories renamed to match new commands
- New `radar/SKILL.md` for the combined command
- New `scripts/bump-version.sh`
- Updated hook with simplified timeout and first-run detection

---

## Part 6: Versioning and Migration

### Version Bump

This is a **major version bump to 3.0.0** for the radar plugin (breaking: renamed skills, renamed directories, renamed marketplace identifier).

Open Brain bumps to **2.0.0** (breaking: new hook behavior, part of renamed marketplace repo).

### Migration for Existing Users

The existing user base is small. No automated migration. README includes:

> **Upgrading from `claude-workflow-analyst`?**
> ```bash
> /plugin marketplace remove flippyhead/claude-workflow-analyst
> /plugin marketplace add flippyhead/radar
> ```
> Your Open Brain data is unchanged — it lives on the server, not in the plugin.

---

## Part 7: README and Marketplace Presentation

### README Structure

```markdown
# Radar

Your AI development radar. Watches your sessions, scans the ecosystem,
and recommends what matters to you.

Ships two plugins:
- **Radar** — workflow intelligence for Claude Code and Cowork
- **Open Brain** — persistent AI memory across sessions

## Quick Start

  /plugin marketplace add flippyhead/radar
  /radar-analyze

## Commands

### Radar (workflow intelligence)
| Command | What it does |
|---------|-------------|
| /radar | Scan ecosystem + recommend improvements (combined) |
| /radar-analyze | Analyze your recent coding sessions |
| /radar-scan | Scan external sources for new tools and techniques |
| /radar-recommend | Get personalized recommendations from your catalogue |

### Open Brain (persistent memory)
| Command | What it does |
|---------|-------------|
| /brain-init | Set up your brain from connected tools |
| /brain-sync | Sync current project to your brain |
| /weekly-review | Weekly synthesis of your work and goals |

## How They Work Together

Radar works standalone — your session analysis and ecosystem scanning
run in terminal-only mode with zero setup.

Connect Open Brain for cross-session memory: persistent catalogue,
goal-aware recommendations, and weekly reviews.

## Install Individually

  /plugin install radar@flippyhead/radar
  /plugin install open-brain@flippyhead/radar
```

### Marketplace Descriptions

**Radar:** "Analyzes your coding sessions, scans the AI ecosystem, and recommends tools and techniques that match your goals and workflow."

**Open Brain:** "Persistent AI memory — save thoughts, track goals, sync projects, and get weekly reviews across all your sessions."

---

## Decisions and Trade-offs

1. **Two plugins vs one:** Two, because the audiences are distinct. Brain users may not want workflow analysis. Radar users may not want persistent memory.

2. **Brain optional vs required:** Optional. Terminal-first, brain upgrades. Reduces onboarding friction and makes radar useful from first run.

3. **Platform-neutral naming:** No `claude-` prefix. Enables future Codex/Cursor distribution without rebrand.

4. **Clean break vs backward compatibility:** Clean break (3.0.0). Small user base doesn't justify compatibility shims.

5. **Combined `/radar` command:** Exists for convenience. Separate scan/recommend commands exist for scheduling flexibility (cron scan daily, recommend weekly).

6. **Local catalogue fallback:** `~/.claude/radar-catalogue.json` auto-created on first run without brain. Ensures scan/recommend work completely offline.
