# Plugin Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend scan-deps to scan installed Claude Code plugins for updates, surfacing them in the radar-scan catalogue.

**Architecture:** Add a `--plugins` flag to the scan-deps CLI that accepts a JSON file of plugin repo info. A new `fetchPluginUpdates()` function handles dedicated-repo plugins (releases API) and monorepo plugins (Compare/commits API with path scoping). The radar-scan SKILL.md builds the plugin input from `installed_plugins.json` + `known_marketplaces.json` and routes results to `[Radar] Claude Code`.

**Tech Stack:** TypeScript, Node.js native fetch, GitHub REST API, vitest

**Repos:** Tasks 1-5 are in `~/Development/workflow-analyzer`. Task 6 is in `~/Development/claude-workflow-analyst`. Note: this repo was recently rebranded — `workflow-analyst` plugin is now `radar`, `scout` skill is now `radar-scan`, `[Scout]` lists are now `[Radar]`.

---

### Task 1: Add plugin types

**Files:**
- Modify: `~/Development/workflow-analyzer/src/deps/types.ts`

- [ ] **Step 1: Write the new types**

Add to the end of `src/deps/types.ts`:

```typescript
/** Input from the scout skill describing an installed plugin */
export interface PluginInput {
  /** Plugin name, e.g. "superpowers" */
  name: string;
  /** Marketplace that hosts this plugin */
  marketplace: string;
  /** GitHub owner/repo */
  repo: string;
  /** Subdirectory within repo for monorepo plugins, null for dedicated repos */
  repoPath: string | null;
  /** Currently installed version */
  installedVersion: string;
  /** Git commit SHA of the installed version */
  gitCommitSha: string;
}

/** Extended release entry with plugin-specific fields */
export interface PluginReleaseEntry extends ReleaseEntry {
  /** Distinguishes plugin releases from npm dependency releases */
  sourceType: "plugin";
  /** Version currently installed locally */
  installedVersion: string;
}

/** Output shape when plugins are scanned */
export interface ScanDepsWithPluginsOutput extends ScanDepsOutput {
  pluginsScanned: number;
  pluginsWithUpdates: number;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd ~/Development/workflow-analyzer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/types.ts
git commit -m "feat(scan-deps): add plugin input and output types"
```

---

### Task 2: Implement plugin update fetcher

**Files:**
- Create: `~/Development/workflow-analyzer/src/deps/plugin-releases.ts`
- Test: `~/Development/workflow-analyzer/src/deps/__tests__/plugin-releases.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/deps/__tests__/plugin-releases.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPluginUpdates } from "../plugin-releases.js";
import { PluginInput } from "../types.js";

describe("fetchPluginUpdates", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const makeDedicatedPlugin = (overrides?: Partial<PluginInput>): PluginInput => ({
    name: "superpowers",
    marketplace: "claude-plugins-official",
    repo: "obra/superpowers",
    repoPath: null,
    installedVersion: "5.0.5",
    gitCommitSha: "abc123",
    ...overrides,
  });

  const makeMonorepoPlugin = (overrides?: Partial<PluginInput>): PluginInput => ({
    name: "figma",
    marketplace: "claude-plugins-official",
    repo: "anthropics/claude-plugins-official",
    repoPath: "plugins/figma",
    installedVersion: "2.0.2",
    gitCommitSha: "def456",
    ...overrides,
  });

  it("fetches releases for dedicated-repo plugins", async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () =>
        Promise.resolve([
          {
            tag_name: "v5.0.6",
            name: "superpowers 5.0.6",
            published_at: twoDaysAgo.toISOString(),
            body: "Added visual companion",
            html_url: "https://github.com/obra/superpowers/releases/tag/v5.0.6",
          },
        ]),
    }) as any;

    const result = await fetchPluginUpdates([makeDedicatedPlugin()], 7);

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].sourceType).toBe("plugin");
    expect(result.releases[0].installedVersion).toBe("5.0.5");
    expect(result.releases[0].packages).toEqual(["superpowers"]);
    expect(result.releases[0].release.tag).toBe("v5.0.6");
    expect(result.pluginsWithUpdates).toBe(1);
  });

  it("uses Compare API for monorepo plugins", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          commits: [
            {
              sha: "new123",
              commit: {
                message: "feat(figma): add code-connect mappings",
                author: { date: new Date().toISOString() },
              },
            },
          ],
          files: [
            { filename: "plugins/figma/skills/figma-use/SKILL.md" },
            { filename: "plugins/figma/.claude-plugin/plugin.json" },
          ],
        }),
    }) as any;

    const result = await fetchPluginUpdates([makeMonorepoPlugin()], 7);

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].sourceType).toBe("plugin");
    expect(result.releases[0].packages).toEqual(["figma"]);
    expect(result.releases[0].release.tag).toBe("unreleased");
    expect(result.releases[0].release.body).toContain("add code-connect mappings");

    // Verify Compare API was called with the right sha
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/compare/def456...HEAD"),
      expect.any(Object)
    );
  });

  it("filters monorepo commits to only those touching the plugin path", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          commits: [
            {
              sha: "aaa",
              commit: {
                message: "feat(figma): update something",
                author: { date: new Date().toISOString() },
              },
            },
            {
              sha: "bbb",
              commit: {
                message: "feat(github): unrelated change",
                author: { date: new Date().toISOString() },
              },
            },
          ],
          files: [
            { filename: "plugins/figma/skills/figma-use/SKILL.md" },
            { filename: "plugins/github/skills/github/SKILL.md" },
          ],
        }),
    }) as any;

    const result = await fetchPluginUpdates([makeMonorepoPlugin()], 7);

    // Should only include commits that touch plugins/figma/ files
    // The compare API returns all commits in the range, but files tells us what changed.
    // We create the entry if ANY file matches the repoPath.
    expect(result.releases).toHaveLength(1);
  });

  it("skips monorepo plugins with no relevant commits", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          commits: [
            {
              sha: "ccc",
              commit: {
                message: "feat(github): unrelated",
                author: { date: new Date().toISOString() },
              },
            },
          ],
          files: [{ filename: "plugins/github/skills/github/SKILL.md" }],
        }),
    }) as any;

    const result = await fetchPluginUpdates([makeMonorepoPlugin()], 7);
    expect(result.releases).toHaveLength(0);
    expect(result.pluginsWithUpdates).toBe(0);
  });

  it("falls back to date-scoped commits when Compare API returns 404", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Compare API 404
        return Promise.resolve({ ok: false, status: 404, headers: new Headers() });
      }
      // Fallback commits API
      return Promise.resolve({
        ok: true,
        headers: new Headers(),
        json: () =>
          Promise.resolve([
            {
              sha: "fff",
              commit: {
                message: "update figma plugin",
                author: { date: new Date().toISOString() },
              },
            },
          ]),
      });
    }) as any;

    const result = await fetchPluginUpdates([makeMonorepoPlugin()], 7);

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].release.tag).toBe("unreleased");

    // Second call should be to commits API with path param
    const secondCallUrl = vi.mocked(globalThis.fetch).mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("/commits?");
    expect(secondCallUrl).toContain("path=plugins/figma");
  });

  it("falls back to commits for dedicated-repo with no releases", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Releases API returns empty
        return Promise.resolve({
          ok: true,
          headers: new Headers(),
          json: () => Promise.resolve([]),
        });
      }
      // Compare API
      return Promise.resolve({
        ok: true,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            commits: [
              {
                sha: "new1",
                commit: {
                  message: "fix: something important",
                  author: { date: new Date().toISOString() },
                },
              },
            ],
            files: [{ filename: "src/foo.ts" }],
          }),
      });
    }) as any;

    const result = await fetchPluginUpdates([makeDedicatedPlugin()], 7);

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].release.tag).toBe("unreleased");
    expect(result.releases[0].release.body).toContain("something important");
  });

  it("handles rate limiting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ "x-ratelimit-remaining": "0" }),
    }) as any;

    const plugins = [makeDedicatedPlugin(), makeMonorepoPlugin()];
    const result = await fetchPluginUpdates(plugins, 7);
    expect(result.rateLimited).toBe(true);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as any;

    const result = await fetchPluginUpdates([makeDedicatedPlugin()], 7);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ECONNREFUSED");
    expect(result.releases).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/plugin-releases.test.ts`
Expected: FAIL — module `../plugin-releases.js` not found

- [ ] **Step 3: Implement fetchPluginUpdates**

Create `src/deps/plugin-releases.ts`:

```typescript
import { PluginInput, PluginReleaseEntry } from "./types.js";

interface FetchPluginUpdatesResult {
  releases: PluginReleaseEntry[];
  pluginsWithUpdates: number;
  rateLimited: boolean;
  errors: string[];
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function isRateLimited(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status === 403) {
    return response.headers.get("x-ratelimit-remaining") === "0";
  }
  return false;
}

/**
 * Fetch updates for dedicated-repo plugins using the releases API.
 * Falls back to Compare API if no releases found.
 */
async function fetchDedicatedRepoUpdates(
  plugin: PluginInput,
  sinceDays: number,
  headers: Record<string, string>
): Promise<{ releases: PluginReleaseEntry[]; rateLimited: boolean; error?: string }> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  // Try releases API first
  const response = await fetch(
    `https://api.github.com/repos/${plugin.repo}/releases?per_page=10`,
    { headers }
  );

  if (!response.ok) {
    if (isRateLimited(response)) {
      return { releases: [], rateLimited: true };
    }
    return { releases: [], rateLimited: false, error: `GitHub ${response.status} for ${plugin.repo}` };
  }

  const ghReleases = await response.json();
  const releases: PluginReleaseEntry[] = [];

  if (Array.isArray(ghReleases)) {
    for (const ghRelease of ghReleases) {
      const publishedAt = new Date(ghRelease.published_at);
      if (publishedAt < sinceDate) continue;

      releases.push({
        packages: [plugin.name],
        repo: plugin.repo,
        repoDescription: "",
        sourceType: "plugin",
        installedVersion: plugin.installedVersion,
        release: {
          tag: ghRelease.tag_name,
          name: ghRelease.name || ghRelease.tag_name,
          publishedAt: ghRelease.published_at,
          body: ghRelease.body || "",
          url: ghRelease.html_url,
        },
        usedBy: [],
      });
    }
  }

  // If no releases, fall back to Compare API
  if (releases.length === 0) {
    const compareResult = await fetchCompareCommits(plugin, sinceDays, headers);
    return compareResult;
  }

  return { releases, rateLimited: false };
}

/**
 * Fetch updates for monorepo plugins using the Compare API with path filtering.
 * Falls back to date-scoped commits if Compare API returns 404.
 */
async function fetchMonorepoUpdates(
  plugin: PluginInput,
  sinceDays: number,
  headers: Record<string, string>
): Promise<{ releases: PluginReleaseEntry[]; rateLimited: boolean; error?: string }> {
  return fetchCompareCommits(plugin, sinceDays, headers);
}

/**
 * Shared logic: fetch commits via Compare API, with date-scoped fallback.
 * For monorepo plugins, filters files by repoPath.
 */
async function fetchCompareCommits(
  plugin: PluginInput,
  sinceDays: number,
  headers: Record<string, string>
): Promise<{ releases: PluginReleaseEntry[]; rateLimited: boolean; error?: string }> {
  // Try Compare API
  const compareUrl = `https://api.github.com/repos/${plugin.repo}/compare/${plugin.gitCommitSha}...HEAD`;
  const response = await fetch(compareUrl, { headers });

  if (response.ok) {
    const data = await response.json();
    return processCompareResponse(data, plugin);
  }

  if (isRateLimited(response)) {
    return { releases: [], rateLimited: true };
  }

  // 404 means sha is invalid — fall back to date-scoped commits
  if (response.status === 404) {
    return fetchDateScopedCommits(plugin, sinceDays, headers);
  }

  return { releases: [], rateLimited: false, error: `GitHub ${response.status} for ${plugin.repo} compare` };
}

function processCompareResponse(
  data: any,
  plugin: PluginInput
): { releases: PluginReleaseEntry[]; rateLimited: boolean } {
  const commits = data.commits || [];
  const files = data.files || [];

  // For monorepo plugins, check if any changed files are under the plugin's path
  if (plugin.repoPath) {
    const hasRelevantFiles = files.some(
      (f: any) => f.filename && f.filename.startsWith(plugin.repoPath + "/")
    );
    if (!hasRelevantFiles) {
      return { releases: [], rateLimited: false };
    }
  }

  if (commits.length === 0) {
    return { releases: [], rateLimited: false };
  }

  const commitMessages = commits
    .map((c: any) => `- ${c.commit.message.split("\n")[0]}`)
    .join("\n");

  const latestDate = commits[commits.length - 1]?.commit?.author?.date || new Date().toISOString();

  return {
    releases: [
      {
        packages: [plugin.name],
        repo: plugin.repo,
        repoDescription: "",
        sourceType: "plugin",
        installedVersion: plugin.installedVersion,
        release: {
          tag: "unreleased",
          name: `${plugin.name} (unreleased changes)`,
          publishedAt: latestDate,
          body: commitMessages,
          url: `https://github.com/${plugin.repo}`,
        },
        usedBy: [],
      },
    ],
    rateLimited: false,
  };
}

async function fetchDateScopedCommits(
  plugin: PluginInput,
  sinceDays: number,
  headers: Record<string, string>
): Promise<{ releases: PluginReleaseEntry[]; rateLimited: boolean; error?: string }> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  let url = `https://api.github.com/repos/${plugin.repo}/commits?since=${sinceDate.toISOString()}&per_page=20`;
  if (plugin.repoPath) {
    url += `&path=${encodeURIComponent(plugin.repoPath)}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (isRateLimited(response)) {
      return { releases: [], rateLimited: true };
    }
    return { releases: [], rateLimited: false, error: `GitHub ${response.status} for ${plugin.repo} commits` };
  }

  const commits = await response.json();

  if (!Array.isArray(commits) || commits.length === 0) {
    return { releases: [], rateLimited: false };
  }

  const commitMessages = commits
    .map((c: any) => `- ${c.commit.message.split("\n")[0]}`)
    .join("\n");

  const latestDate = commits[0]?.commit?.author?.date || new Date().toISOString();

  return {
    releases: [
      {
        packages: [plugin.name],
        repo: plugin.repo,
        repoDescription: "",
        sourceType: "plugin",
        installedVersion: plugin.installedVersion,
        release: {
          tag: "unreleased",
          name: `${plugin.name} (unreleased changes)`,
          publishedAt: latestDate,
          body: commitMessages,
          url: `https://github.com/${plugin.repo}`,
        },
        usedBy: [],
      },
    ],
    rateLimited: false,
  };
}

export async function fetchPluginUpdates(
  plugins: PluginInput[],
  sinceDays: number
): Promise<FetchPluginUpdatesResult> {
  const allReleases: PluginReleaseEntry[] = [];
  const errors: string[] = [];
  let rateLimited = false;
  const pluginsWithUpdatesSet = new Set<string>();

  const headers = getHeaders();

  for (const plugin of plugins) {
    if (rateLimited) break;

    try {
      const result = plugin.repoPath
        ? await fetchMonorepoUpdates(plugin, sinceDays, headers)
        : await fetchDedicatedRepoUpdates(plugin, sinceDays, headers);

      if (result.rateLimited) {
        rateLimited = true;
        errors.push(
          `GitHub rate limit hit while scanning plugin ${plugin.name}. ` +
          `${allReleases.length} plugin releases fetched so far.`
        );
        break;
      }

      if (result.error) {
        errors.push(result.error);
      }

      if (result.releases.length > 0) {
        allReleases.push(...result.releases);
        pluginsWithUpdatesSet.add(plugin.name);
      }
    } catch (err) {
      errors.push(
        `Failed to fetch updates for plugin ${plugin.name}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return {
    releases: allReleases,
    pluginsWithUpdates: pluginsWithUpdatesSet.size,
    rateLimited,
    errors,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/plugin-releases.test.ts`
Expected: All 8 tests pass

- [ ] **Step 5: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/plugin-releases.ts src/deps/__tests__/plugin-releases.test.ts
git commit -m "feat(scan-deps): add plugin update fetcher with Compare API fallback"
```

---

### Task 3: Wire plugins into scan-deps command

**Files:**
- Modify: `~/Development/workflow-analyzer/src/commands/scan-deps.ts`
- Modify: `~/Development/workflow-analyzer/src/cli.ts`
- Modify: `~/Development/workflow-analyzer/src/index.ts`
- Test: `~/Development/workflow-analyzer/src/commands/__tests__/scan-deps.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/commands/__tests__/scan-deps.test.ts`:

```typescript
it("includes plugin releases when pluginsPath is provided", async () => {
  const { writeFile, mkdtemp, rm } = await import("fs/promises");
  const { join } = await import("path");
  const { tmpdir } = await import("os");

  const tmpDir = await mkdtemp(join(tmpdir(), "scan-deps-test-"));

  const pluginsJson = JSON.stringify({
    plugins: [
      {
        name: "test-plugin",
        marketplace: "test-marketplace",
        repo: "owner/test-plugin",
        repoPath: null,
        installedVersion: "1.0.0",
        gitCommitSha: "abc123",
      },
    ],
  });

  const pluginsPath = join(tmpDir, "plugins.json");
  await writeFile(pluginsPath, pluginsJson);

  // Mock fetch for the releases API
  const originalFetch = globalThis.fetch;
  const now = new Date();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers(),
    json: () =>
      Promise.resolve([
        {
          tag_name: "v1.1.0",
          name: "v1.1.0",
          published_at: now.toISOString(),
          body: "New feature",
          html_url: "https://github.com/owner/test-plugin/releases/tag/v1.1.0",
        },
      ]),
  }) as any;

  try {
    const result = await scanDeps({
      projectsBasePath: tmpDir,
      sinceDays: 7,
      includeDev: false,
      pluginsPath,
    });

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].sourceType).toBe("plugin");
    expect(result.pluginsScanned).toBe(1);
    expect(result.pluginsWithUpdates).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(tmpDir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/commands/__tests__/scan-deps.test.ts`
Expected: FAIL — `pluginsPath` not in options type, `pluginsScanned` not in output

- [ ] **Step 3: Update scan-deps command to accept and process plugins**

Replace the contents of `src/commands/scan-deps.ts` with:

```typescript
import { readFile } from "fs/promises";
import { discoverProjectDeps } from "../deps/project-discovery.js";
import { resolveToGithubRepos } from "../deps/npm-resolver.js";
import { fetchRecentReleases } from "../deps/github-releases.js";
import { fetchPluginUpdates } from "../deps/plugin-releases.js";
import {
  PluginInput,
  ReleaseEntry,
  PluginReleaseEntry,
  ScanDepsOutput,
  ScanDepsWithPluginsOutput,
} from "../deps/types.js";

interface ScanDepsCommandOptions {
  projectsBasePath: string;
  sinceDays: number;
  includeDev: boolean;
  pluginsPath?: string;
}

export async function scanDeps(
  options: ScanDepsCommandOptions
): Promise<ScanDepsOutput | ScanDepsWithPluginsOutput> {
  const allErrors: string[] = [];

  const discovery = await discoverProjectDeps(options.projectsBasePath, {
    includeDev: options.includeDev,
  });

  let depReleases: ReleaseEntry[] = [];
  let reposResolved = 0;
  let reposWithoutReleases = 0;
  let rateLimited = false;

  if (discovery.packages.size > 0) {
    const { repos, errors: resolveErrors } = await resolveToGithubRepos(
      discovery.packageDetails
    );
    allErrors.push(...resolveErrors);
    reposResolved = repos.length;

    const releaseResult = await fetchRecentReleases(repos, options.sinceDays);
    depReleases = releaseResult.releases;
    reposWithoutReleases = releaseResult.reposWithoutReleases;
    rateLimited = releaseResult.rateLimited;
    allErrors.push(...releaseResult.errors);
  }

  // Process plugins if provided
  let pluginReleases: PluginReleaseEntry[] = [];
  let pluginsScanned = 0;
  let pluginsWithUpdates = 0;

  if (options.pluginsPath) {
    try {
      const pluginsJson = await readFile(options.pluginsPath, "utf-8");
      const { plugins } = JSON.parse(pluginsJson) as { plugins: PluginInput[] };
      pluginsScanned = plugins.length;

      const pluginResult = await fetchPluginUpdates(plugins, options.sinceDays);
      pluginReleases = pluginResult.releases;
      pluginsWithUpdates = pluginResult.pluginsWithUpdates;
      if (pluginResult.rateLimited) rateLimited = true;
      allErrors.push(...pluginResult.errors);
    } catch (err) {
      allErrors.push(
        `Failed to process plugins file: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const allReleases: (ReleaseEntry | PluginReleaseEntry)[] = [
    ...depReleases,
    ...pluginReleases,
  ];

  const baseOutput: ScanDepsOutput = {
    scannedAt: new Date().toISOString(),
    projectCount: discovery.projects.length,
    packageCount: discovery.packages.size,
    reposResolved,
    reposWithoutReleases,
    rateLimited,
    errors: allErrors,
    releases: allReleases,
  };

  if (options.pluginsPath) {
    return {
      ...baseOutput,
      pluginsScanned,
      pluginsWithUpdates,
    } as ScanDepsWithPluginsOutput;
  }

  return baseOutput;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/commands/__tests__/scan-deps.test.ts`
Expected: All tests pass

- [ ] **Step 5: Add --plugins flag to CLI**

In `src/cli.ts`, find the `scan-deps` command definition (around line 93-138) and add the `--plugins` option. Add this line after the `--include-dev` option:

```typescript
  .option("-p, --plugins <path>", "JSON file with plugin repo info to scan")
```

And pass it through in the action handler. Change the `scanDeps` call to:

```typescript
    const result = await scanDeps({
      projectsBasePath,
      sinceDays,
      includeDev: !!opts.includeDev,
      pluginsPath: opts.plugins,
    });
```

Update the summary log to include plugin stats when present:

```typescript
    if (opts.output) {
      const { writeFile } = await import("fs/promises");
      await writeFile(opts.output, json, "utf-8");
      let summary =
        `Scanned ${result.projectCount} projects, ${result.packageCount} packages, ` +
        `${result.reposResolved} repos → ${result.releases.length} releases`;
      if ("pluginsScanned" in result) {
        summary += `, ${result.pluginsScanned} plugins (${result.pluginsWithUpdates} with updates)`;
      }
      summary += ` → ${opts.output}`;
      console.log(summary);
    }
```

- [ ] **Step 6: Export new types from index.ts**

The new types are already exported via the `export * from "./deps/types.js"` line in `src/index.ts`. Verify `fetchPluginUpdates` doesn't need a public export (it doesn't — it's only used internally by `scanDeps`).

- [ ] **Step 7: Run full test suite**

Run: `cd ~/Development/workflow-analyzer && npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/commands/scan-deps.ts src/commands/__tests__/scan-deps.test.ts src/cli.ts
git commit -m "feat(scan-deps): add --plugins flag for scanning installed Claude Code plugins"
```

---

### Task 4: Build and verify end-to-end

**Files:**
- No new files

- [ ] **Step 1: Build the project**

Run: `cd ~/Development/workflow-analyzer && npm run build`
Expected: Compiles without errors

- [ ] **Step 2: Create a test plugins JSON file**

Run:

```bash
cat > /tmp/test-plugins.json << 'EOF'
{
  "plugins": [
    {
      "name": "superpowers",
      "marketplace": "claude-plugins-official",
      "repo": "obra/superpowers",
      "repoPath": null,
      "installedVersion": "5.0.5",
      "gitCommitSha": "e4a2375cb705ca5800f0833528ce36a3faf9017a"
    }
  ]
}
EOF
```

- [ ] **Step 3: Run scan-deps with --plugins flag**

Run: `cd ~/Development/workflow-analyzer && node dist/cli.js scan-deps --since 30 --plugins /tmp/test-plugins.json`
Expected: JSON output containing a release entry with `"sourceType": "plugin"` for superpowers (if releases exist in the last 30 days), plus `pluginsScanned` and `pluginsWithUpdates` in root.

- [ ] **Step 4: Commit (version bump)**

```bash
cd ~/Development/workflow-analyzer
# Bump version in package.json from 0.2.0 to 0.3.0 (minor: new feature)
npm version minor --no-git-tag-version
git add package.json
git commit -m "chore: bump workflow-analyzer to 0.3.0 for plugin scanning"
```

---

### Task 5: Publish workflow-analyzer

**Files:**
- No file changes

- [ ] **Step 1: Publish to npm**

Run: `cd ~/Development/workflow-analyzer && npm publish`
Expected: Published `@flippyhead/workflow-analyzer@0.3.0`

- [ ] **Step 2: Verify the published version**

Run: `npx @flippyhead/workflow-analyzer@0.3.0 scan-deps --help`
Expected: Shows `--plugins` option in help output

- [ ] **Step 3: Commit and tag**

```bash
cd ~/Development/workflow-analyzer
git tag v0.3.0
git push && git push --tags
```

---

### Task 6: Update radar-scan SKILL.md

**Files:**
- Modify: `~/Development/claude-workflow-analyst/plugins/radar/skills/radar-scan/SKILL.md`

- [ ] **Step 1: Update Step 2.5 to build and pass plugin input**

In `SKILL.md`, replace the current Step 2.5 content. The new Step 2.5 should read:

````markdown
### Step 2.5: Scan Project Dependencies & Plugin Updates

**Build plugin input:**

Before calling `scan-deps`, build the plugin repos JSON:

1. Read `~/.claude/plugins/installed_plugins.json`. Each key is `pluginName@marketplaceName`.
2. Read `~/.claude/plugins/known_marketplaces.json` to resolve each marketplace to a GitHub repo.
3. For each installed plugin:
   a. Read the plugin's `plugin.json` from its `installPath` (in `installed_plugins.json`). If it has a `repository` field, extract the GitHub `owner/repo` from the URL and set `repoPath` to `null`.
   b. If no `repository` field, use the marketplace's `source.repo` (or parse from `source.url`). Set `repoPath` to the plugin's subdirectory within the marketplace (e.g., `plugins/<pluginName>`).
4. Write the JSON to `/tmp/workflow-analyzer-plugins.json` in this format:

```json
{
  "plugins": [
    {
      "name": "superpowers",
      "marketplace": "claude-plugins-official",
      "repo": "obra/superpowers",
      "repoPath": null,
      "installedVersion": "5.0.6",
      "gitCommitSha": "e4a2375..."
    }
  ]
}
```

**Run scan-deps:**

Run `npx @flippyhead/workflow-analyzer@latest scan-deps --since ${DAYS} --plugins /tmp/workflow-analyzer-plugins.json --output /tmp/workflow-analyzer-deps.json`. Read the output JSON.

If the command fails or is not available, log a warning and skip to Step 3 — dependency and plugin scanning is additive, not required.

**Process dependency results:**

For each entry in the `releases` array where `sourceType` is NOT `"plugin"`:
1. Read the `release.body` (release notes) and `repoDescription` to assess relevance
2. **Skip** routine releases: patch version bumps, typo fixes, minor dep updates, internal refactors, CI/CD changes, documentation-only releases
3. **Catalogue** interesting releases: new CLI tools, MCP servers/integrations, AI/agent features, breaking changes, significant new APIs, performance improvements
4. Create catalogue items using the standard enrichment from Step 5, with `source: "dependency-changelog"` and an additional `relevanceHint` of `"direct dependency"`
5. Use the `release.url` as the item URL for deduplication against existing catalogue

**Process plugin results:**

For each entry in the `releases` array where `sourceType` is `"plugin"`:
1. Read the `release.body` to summarize what changed
2. Create catalogue items with `source: "plugin-changelog"`, `category: "claude-code"`, and `relevanceHints: ["installed plugin", "<plugin-name>"]`
3. Route to the `[Radar] Claude Code` list
4. Use the `release.url` as the item URL for deduplication
````

- [ ] **Step 2: Add `plugin-changelog` to the source enum in Step 5**

In the Step 5 section, add `plugin-changelog` to the source enum list:

```
"source": "<one of: anthropic-changelog, hackernews, github, youtube, manual, dependency-changelog, plugin-changelog>",
```

- [ ] **Step 3: Update Step 6 report format**

Add a plugin updates section to the report template in Step 6. Before the existing bullet points, add:

```markdown
- How many plugin updates were found
- Plugin update details: `<plugin> <installed> → <latest>: <summary>` for releases, or `<plugin> <installed> (unreleased changes): <summary>` for commit-based entries
```

- [ ] **Step 4: Verify the SKILL.md is well-formed**

Read through the updated SKILL.md to ensure no broken markdown, consistent step numbering, and no leftover old content.

- [ ] **Step 5: Bump plugin version**

Check the current radar version in `plugins/radar/.claude-plugin/plugin.json` and bump minor:

Run: `cd ~/Development/claude-workflow-analyst && ./scripts/bump-version.sh radar <next-minor>`

- [ ] **Step 6: Commit**

```bash
cd ~/Development/claude-workflow-analyst
git add plugins/radar/skills/radar-scan/SKILL.md
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json plugins/radar/.claude-plugin/plugin.json
git commit -m "feat(radar-scan): scan installed plugins for updates via scan-deps --plugins"
```
