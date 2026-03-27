# Plugin & Skill Update Scanner for scout

**Date:** 2026-03-27
**Status:** Draft

## Summary

Extend `scan-deps` in `@flippyhead/workflow-analyzer` to also scan installed Claude Code plugins for recent releases. The scout skill passes plugin repo info to `scan-deps`, which fetches releases using the same GitHub Releases API it already uses for npm dependencies. Plugin updates surface in the `[Scout] Claude Code` catalogue list tagged with `source: "plugin-changelog"`.

## Motivation

Installed plugins and skills (superpowers, figma, frontend-design, etc.) are updated frequently with new skills, workflow improvements, and behavioral changes. These updates directly affect daily workflow but are invisible — there's no notification when a plugin ships a new version. The scout skill already scans npm dependency changelogs via `scan-deps`; extending it to also cover plugin repos keeps the architecture DRY and gives the user a single place to review what's new across their entire toolchain.

## Changes to scan-deps CLI

### New flag

```
npx @flippyhead/workflow-analyzer@latest scan-deps [existing flags] --plugins <path>
```

- `--plugins <path>` — path to a JSON file containing plugin repo info to scan. Optional; if omitted, scan-deps behaves exactly as before.

### Plugin input format

The scout skill generates a temporary JSON file from `installed_plugins.json` + `known_marketplaces.json`:

```json
{
  "plugins": [
    {
      "name": "superpowers",
      "marketplace": "claude-plugins-official",
      "repo": "obra/superpowers",
      "repoPath": null,
      "installedVersion": "5.0.6",
      "gitCommitSha": "e4a2375cb705ca5800f0833528ce36a3faf9017a"
    },
    {
      "name": "figma",
      "marketplace": "claude-plugins-official",
      "repo": "anthropics/claude-plugins-official",
      "repoPath": "plugins/figma",
      "installedVersion": "2.0.2",
      "gitCommitSha": "46a7d1bec64e0fd016eea6a66eda8ac34b44c491"
    }
  ]
}
```

- `repoPath` — subdirectory within the repo containing this plugin's source. Set when the plugin lives inside a monorepo marketplace (e.g., `plugins/figma` within `anthropics/claude-plugins-official`). `null` for plugins with their own dedicated repo.

The skill builds this by:
1. Reading `~/.claude/plugins/installed_plugins.json` to get plugin names, versions, and commit shas. The plugin key format is `pluginName@marketplaceName`.
2. Reading `~/.claude/plugins/known_marketplaces.json` to resolve each plugin's marketplace to a GitHub repo
3. Extracting `repo` from the marketplace's `source.repo` field (for `source: "github"`) or parsing it from `source.url` (for `source: "git"`)

**Monorepo marketplace note:** Some marketplaces (e.g., `claude-plugins-official`) host multiple plugins in a single repo (`anthropics/claude-plugins-official`), but individual plugins may have their own upstream repo (e.g., superpowers lives at `obra/superpowers`, not in the official repo). The skill should check each plugin's `plugin.json` for a `repository` field and prefer that over the marketplace repo. If no `repository` field exists, fall back to the marketplace repo. Deduplicate repos before passing to scan-deps — multiple plugins sharing a repo should result in a single entry with all plugin names in the `packages` array.

### Processing in scan-deps

When `--plugins` is provided:

1. Read and parse the plugins JSON file
2. For each plugin entry, fetch recent releases from `https://api.github.com/repos/:owner/:repo/releases?per_page=10`, filtered by `--since` window — the same GitHub releases fetch logic already used for npm deps
3. Output each release into the existing `releases` array with additional fields:

```json
{
  "packages": ["superpowers"],
  "repo": "obra/superpowers",
  "repoDescription": "Core skills library for Claude Code",
  "sourceType": "plugin",
  "installedVersion": "5.0.6",
  "release": {
    "tag": "v5.0.6",
    "name": "superpowers 5.0.6",
    "publishedAt": "2026-03-25T00:00:00Z",
    "body": "release notes markdown...",
    "url": "https://github.com/obra/superpowers/releases/tag/v5.0.6"
  },
  "usedBy": []
}
```

The `sourceType: "plugin"` field distinguishes plugin releases from npm dependency releases (which have no `sourceType` field or `sourceType: "dependency"`). The `installedVersion` field lets the skill compare against released versions.

### Monorepo plugins (path-scoped commits)

Some plugins share a marketplace repo (e.g., figma, github, context7 all live in `anthropics/claude-plugins-official`). Marketplace repos don't tag per-plugin releases, so the releases API returns noise. For plugins with a non-null `repoPath`, scan-deps skips the releases API and goes straight to path-scoped commits:

1. Use the GitHub Compare API: `GET /repos/:owner/:repo/compare/{gitCommitSha}...HEAD`
   - If `repoPath` is set, filter the returned commits to only those touching files under that path (the compare response includes `files` with paths)
   - If the sha is invalid (404), fall back to `GET /repos/:owner/:repo/commits?path={repoPath}&since=<since_date>&per_page=20`
2. Summarize commit messages into a synthetic release entry with `"tag": "unreleased"` and the commit messages concatenated as `body`
3. Only create the entry if there are relevant commits

### Dedicated-repo plugins (releases first, commits fallback)

For plugins with their own repo (`repoPath` is null — e.g., superpowers at `obra/superpowers`):

1. Fetch releases via `GET /repos/:owner/:repo/releases?per_page=10`, filtered by `--since` window — the same logic already used for npm deps
2. If zero releases found, fall back to the Compare API: `GET /repos/:owner/:repo/compare/{gitCommitSha}...HEAD` to get commits since installed version
3. If the sha is invalid (404), fall back to date-scoped commits: `GET /repos/:owner/:repo/commits?since=<since_date>&per_page=20`

This keeps all GitHub API logic inside `scan-deps` (one place) rather than in the skill.

### Rate limiting

Plugin repos add to the GitHub API request count. With ~9 installed plugins mapping to ~5 unique repos, this adds 5-10 requests (releases + possible commits fallback). Well within limits alongside the existing dep scanning, especially with `GITHUB_TOKEN`.

### Top-level output additions

Add to the output JSON root:

```json
{
  "pluginsScanned": 5,
  "pluginsWithUpdates": 2
}
```

## Changes to scout skill (SKILL.md)

### Step 2.5 modification

Before calling `scan-deps`, the skill now:

1. Reads `~/.claude/plugins/installed_plugins.json`
2. Reads `~/.claude/plugins/known_marketplaces.json`
3. Builds the plugins JSON (mapping each plugin to its marketplace's GitHub repo)
4. Writes it to `/tmp/workflow-analyzer-plugins.json`
5. Passes `--plugins /tmp/workflow-analyzer-plugins.json` to the `scan-deps` command

Updated command:
```
npx @flippyhead/workflow-analyzer@latest scan-deps --since ${DAYS} --plugins /tmp/workflow-analyzer-plugins.json --output /tmp/workflow-analyzer-deps.json
```

### Step 2.5 result processing

When iterating over the `releases` array, check `sourceType`:

- **`"plugin"` entries:** Create catalogue items with `source: "plugin-changelog"`, `category: "claude-code"`, and `relevanceHint: "installed plugin"`. Route to `[Scout] Claude Code` list.
- **Other entries:** Existing behavior (npm dep changelog processing).

### Step 5 tag additions

Add `"plugin-changelog"` to the `source` enum.

### Step 6 report additions

Add a plugin updates section to the summary output. The skill derives the "installed → latest" version display by comparing `installedVersion` against the newest release tag (or showing "unreleased changes" for commit-based entries):

```
**Plugin updates:**
- superpowers 5.0.6 → 5.0.7: Added visual-companion skill, updated brainstorming workflow
- figma 2.0.2 (unreleased changes): Updated code-connect mapping logic

**Other findings:**
- (existing report format)
```

## Architecture

### Files to modify (in workflow-analyzer repo)

- `src/commands/scan-deps.ts` — add `--plugins` option, load plugin JSON, pass to GitHub releases fetcher
- `src/deps/github-releases.ts` — add function to process plugin entries (reuse existing release-fetching logic), add commits fallback
- `src/deps/types.ts` — add `sourceType`, `installedVersion` fields to release output type, add `PluginInput` type

### Files to modify (in this repo)

- `plugins/workflow-analyst/skills/scout/SKILL.md` — update Step 2.5 to build plugin input and pass `--plugins` flag, update Step 5 source enum, update Step 6 report format

### No new files needed

Both changes extend existing modules. No new dependencies.

## What it doesn't do

- No diffing of SKILL.md content between versions — changelog summary level only
- No tracking of which specific skills were added/modified within a plugin (the release notes cover this)
- No auto-updating of plugins — just surfaces what's new
- No scanning of non-GitHub plugin sources (all current marketplaces are GitHub-backed)
