# Dependency Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scan-deps` CLI subcommand to `@flippyhead/workflow-analyzer` that discovers npm dependencies across Claude projects, resolves them to GitHub repos, fetches recent releases, and outputs structured JSON for the scout skill.

**Architecture:** Reuses the existing project discovery from `~/.claude/projects/` (ClaudeCodeParser path decoding), adds a new `src/deps/` module for npm registry resolution and GitHub releases fetching, and registers a new `scan-deps` commander subcommand following the same pattern as `parse` and `publish`.

**Tech Stack:** TypeScript, Node.js built-in `fetch` + `fs/promises` + `node:fs` glob, Commander.js CLI, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-25-dep-scanner-design.md`

**Repos involved:**
- `workflow-analyzer` at `~/Development/workflow-analyzer/` — all code changes
- `claude-workflow-analyst` at `~/Development/claude-workflow-analyst/` — SKILL.md update only

---

## File Structure

### New files (in workflow-analyzer)

| File | Responsibility |
|------|---------------|
| `src/deps/types.ts` | TypeScript interfaces for scan output, npm registry response, GitHub release |
| `src/deps/project-discovery.ts` | Find projects from `~/.claude/projects/`, decode paths, find package.json files, extract deps |
| `src/deps/npm-resolver.ts` | Resolve package names to GitHub owner/repo via npm registry |
| `src/deps/github-releases.ts` | Fetch recent releases from GitHub API with rate limit handling |
| `src/deps/index.ts` | Barrel export for the deps module |
| `src/commands/scan-deps.ts` | Orchestrator: calls discovery → resolution → fetching → outputs JSON |
| `src/deps/__tests__/project-discovery.test.ts` | Tests for project discovery + package.json parsing |
| `src/deps/__tests__/npm-resolver.test.ts` | Tests for npm registry URL parsing |
| `src/deps/__tests__/github-releases.test.ts` | Tests for GitHub releases fetching + rate limiting |
| `src/commands/__tests__/scan-deps.test.ts` | Integration test for the full scan-deps command |

### Modified files

| File | Change |
|------|--------|
| `src/cli.ts` (workflow-analyzer) | Register `scan-deps` subcommand |
| `plugins/workflow-analyst/skills/scout/SKILL.md` (claude-workflow-analyst) | Add Step 2.5 |

---

## Task 1: Types

**Files:**
- Create: `src/deps/types.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// src/deps/types.ts

export interface ScanDepsOptions {
  sinceDays: number;
  includeDev: boolean;
  output?: string;
}

export interface DiscoveredProject {
  /** Decoded filesystem path, e.g. ~/Development/ai-brain */
  path: string;
  /** Encoded directory name from ~/.claude/projects/ */
  encodedDir: string;
}

export interface PackageInfo {
  /** npm package name */
  name: string;
  /** Which project paths use this package */
  usedBy: string[];
  /** Whether it's a devDependency (in any project) */
  isDev: boolean;
}

export interface ResolvedRepo {
  /** GitHub owner/repo, e.g. "get-convex/convex-backend" */
  repo: string;
  /** Repo description from GitHub/npm */
  repoDescription: string;
  /** All package names from user's deps that map to this repo */
  packages: string[];
  /** Project paths that use any of these packages */
  usedBy: string[];
}

export interface ReleaseEntry {
  /** All dep names from user's projects that map to this repo */
  packages: string[];
  /** GitHub owner/repo */
  repo: string;
  /** Repo description */
  repoDescription: string;
  /** Release details */
  release: {
    tag: string;
    name: string;
    publishedAt: string;
    body: string;
    url: string;
  };
  /** Which project paths use packages from this repo */
  usedBy: string[];
}

export interface ScanDepsOutput {
  scannedAt: string;
  projectCount: number;
  packageCount: number;
  reposResolved: number;
  reposWithoutReleases: number;
  rateLimited: boolean;
  errors: string[];
  releases: ReleaseEntry[];
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// src/deps/index.ts
export * from "./types.js";
export { discoverProjectDeps } from "./project-discovery.js";
export { resolveToGithubRepos } from "./npm-resolver.js";
export { fetchRecentReleases } from "./github-releases.js";
```

Note: This file will cause import errors until the other modules exist. That's fine — we'll create them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/types.ts src/deps/index.ts
git commit -m "feat(scan-deps): add type definitions for dependency scanner"
```

---

## Task 2: Project Discovery

**Files:**
- Create: `src/deps/__tests__/project-discovery.test.ts`
- Create: `src/deps/project-discovery.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/deps/__tests__/project-discovery.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { discoverProjectDeps } from "../project-discovery.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("discoverProjectDeps", () => {
  let testDir: string;
  const dirsToClean: string[] = [];

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-discovery-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    dirsToClean.push(testDir);
  });

  afterEach(async () => {
    for (const dir of dirsToClean) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    dirsToClean.length = 0;
  });

  it("discovers package.json deps from encoded project dirs", async () => {
    const projectDir = join(tmpdir(), "test-project-alpha");
    await mkdir(projectDir, { recursive: true });
    dirsToClean.push(projectDir);
    await writeFile(
      join(projectDir, "package.json"),
      JSON.stringify({
        dependencies: { convex: "^1.0.0", react: "^18.0.0" },
        devDependencies: { vitest: "^3.0.0" },
      })
    );

    // Encoded dir name must match the project path with / replaced by -
    const encoded = projectDir.replace(/\//g, "-");
    await mkdir(join(testDir, encoded), { recursive: true });

    const result = await discoverProjectDeps(testDir, { includeDev: false });

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].path).toBe(projectDir);
    expect(result.packages.has("convex")).toBe(true);
    expect(result.packages.has("react")).toBe(true);
    expect(result.packages.has("vitest")).toBe(false);
  });

  it("includes devDependencies when includeDev is true", async () => {
    const projectDir = join(tmpdir(), "test-project-beta");
    await mkdir(projectDir, { recursive: true });
    dirsToClean.push(projectDir);
    await writeFile(
      join(projectDir, "package.json"),
      JSON.stringify({
        dependencies: { convex: "^1.0.0" },
        devDependencies: { vitest: "^3.0.0" },
      })
    );

    const encoded = projectDir.replace(/\//g, "-");
    await mkdir(join(testDir, encoded), { recursive: true });

    const result = await discoverProjectDeps(testDir, { includeDev: true });
    expect(result.packages.has("vitest")).toBe(true);
  });

  it("resolves workspace package.json files", async () => {
    const projectDir = join(tmpdir(), "test-project-mono");
    await mkdir(join(projectDir, "packages/web"), { recursive: true });
    dirsToClean.push(projectDir);
    await writeFile(
      join(projectDir, "package.json"),
      JSON.stringify({
        workspaces: ["packages/*"],
        dependencies: { typescript: "^5.0.0" },
      })
    );
    await writeFile(
      join(projectDir, "packages/web/package.json"),
      JSON.stringify({
        dependencies: { next: "^16.0.0", react: "^18.0.0" },
      })
    );

    const encoded = projectDir.replace(/\//g, "-");
    await mkdir(join(testDir, encoded), { recursive: true });

    const result = await discoverProjectDeps(testDir, { includeDev: false });
    expect(result.packages.has("typescript")).toBe(true);
    expect(result.packages.has("next")).toBe(true);
    expect(result.packages.has("react")).toBe(true);
  });

  it("skips encoded dirs that don't resolve to real paths", async () => {
    const encoded = "-nonexistent-fake-path-xyz";
    await mkdir(join(testDir, encoded), { recursive: true });

    const result = await discoverProjectDeps(testDir, { includeDev: false });
    expect(result.projects).toHaveLength(0);
    expect(result.packages.size).toBe(0);
  });

  it("deduplicates packages across projects and tracks usedBy", async () => {
    const projectA = join(tmpdir(), "test-dedup-a");
    const projectB = join(tmpdir(), "test-dedup-b");
    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });
    dirsToClean.push(projectA, projectB);
    await writeFile(
      join(projectA, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0", zod: "^3.0.0" } })
    );
    await writeFile(
      join(projectB, "package.json"),
      JSON.stringify({ dependencies: { react: "^19.0.0", convex: "^1.0.0" } })
    );

    const encodedA = projectA.replace(/\//g, "-");
    const encodedB = projectB.replace(/\//g, "-");
    await mkdir(join(testDir, encodedA), { recursive: true });
    await mkdir(join(testDir, encodedB), { recursive: true });

    const result = await discoverProjectDeps(testDir, { includeDev: false });
    expect(result.packages.size).toBe(3);
    const reactInfo = result.packageDetails.get("react");
    expect(reactInfo?.usedBy).toContain(projectA);
    expect(reactInfo?.usedBy).toContain(projectB);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/project-discovery.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement project discovery**

```typescript
// src/deps/project-discovery.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { DiscoveredProject, PackageInfo } from "./types.js";

interface DiscoveryOptions {
  includeDev: boolean;
}

interface DiscoveryResult {
  projects: DiscoveredProject[];
  /** Deduplicated set of package names */
  packages: Set<string>;
  /** Package name -> details (usedBy, isDev) */
  packageDetails: Map<string, PackageInfo>;
}

/**
 * Decode an encoded project directory name to its full filesystem path.
 *
 * The encoding replaces "/" with "-", but "-" also appears literally in
 * directory names (e.g., "ai-brain"). We can't naively replace all "-" with "/".
 *
 * Strategy: replace "-" with "/" to get candidates, then walk from the root
 * checking which segments exist on disk. When a segment doesn't exist,
 * try merging it with the next segment (i.e., the "-" was literal).
 */
export async function decodeToFullPath(encoded: string): Promise<string | null> {
  // Strip leading dash
  const cleaned = encoded.startsWith("-") ? encoded.substring(1) : encoded;
  const segments = cleaned.split("-");

  let currentPath = "/";
  let i = 0;

  while (i < segments.length) {
    let candidate = segments[i];
    let found = false;

    // Try progressively longer hyphenated names
    for (let j = i; j < segments.length; j++) {
      if (j > i) {
        candidate += "-" + segments[j];
      }
      const testPath = join(currentPath, candidate);
      try {
        const s = await stat(testPath);
        if (s.isDirectory()) {
          currentPath = testPath;
          i = j + 1;
          found = true;
          break;
        }
      } catch {
        // doesn't exist, try longer candidate
      }
    }

    if (!found) {
      // Can't resolve further — path doesn't exist on disk
      return null;
    }
  }

  return currentPath;
}

/**
 * Read a package.json and extract dependency names.
 */
async function readPackageDeps(
  pkgPath: string,
  includeDev: boolean
): Promise<{ deps: string[]; workspaces: string[] }> {
  try {
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    const deps: string[] = [];

    if (pkg.dependencies) {
      deps.push(...Object.keys(pkg.dependencies));
    }
    if (includeDev && pkg.devDependencies) {
      deps.push(...Object.keys(pkg.devDependencies));
    }

    const workspaces: string[] = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces?.packages ?? [];

    return { deps, workspaces };
  } catch {
    return { deps: [], workspaces: [] };
  }
}

/**
 * Resolve workspace glob patterns to directories containing package.json.
 * Uses fs/promises glob (Node 22+, experimental). Falls back to simple
 * single-wildcard expansion if glob is unavailable.
 */
async function resolveWorkspaces(
  projectRoot: string,
  patterns: string[]
): Promise<string[]> {
  const dirs: string[] = [];
  for (const pattern of patterns) {
    try {
      // Use readdir-based expansion for simple "packages/*" style patterns
      // which covers the vast majority of real workspace configs
      if (pattern.endsWith("/*")) {
        const parentDir = join(projectRoot, pattern.slice(0, -2));
        const entries = await readdir(parentDir).catch(() => [] as string[]);
        for (const entry of entries) {
          const fullPath = join(parentDir, entry);
          try {
            const s = await stat(fullPath);
            if (s.isDirectory()) {
              dirs.push(fullPath);
            }
          } catch {
            // skip
          }
        }
      } else if (!pattern.includes("*")) {
        // Exact path, no glob
        const fullPath = join(projectRoot, pattern);
        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) dirs.push(fullPath);
        } catch {
          // skip
        }
      }
      // Skip complex glob patterns (**, negation) — covers ~95% of cases
    } catch {
      // Skip unresolvable patterns
    }
  }
  return dirs;
}

/**
 * Discover all npm dependencies across Claude-related projects.
 */
export async function discoverProjectDeps(
  projectsBasePath: string,
  options: DiscoveryOptions
): Promise<DiscoveryResult> {
  const resolvedBase = projectsBasePath.replace(/^~/, homedir());
  const projects: DiscoveredProject[] = [];
  const packageDetails = new Map<string, PackageInfo>();

  let encodedDirs: string[];
  try {
    encodedDirs = await readdir(resolvedBase);
  } catch {
    return { projects: [], packages: new Set(), packageDetails };
  }

  for (const encodedDir of encodedDirs) {
    const projectPath = await decodeToFullPath(encodedDir);
    if (!projectPath) continue; // Can't resolve path on disk

    // Try to read root package.json
    const rootPkgPath = join(projectPath, "package.json");
    const { deps: rootDeps, workspaces } = await readPackageDeps(
      rootPkgPath,
      options.includeDev
    );

    if (rootDeps.length === 0 && workspaces.length === 0) {
      // No package.json or empty — check if the file exists at all
      try {
        await readFile(rootPkgPath, "utf-8");
      } catch {
        continue; // No package.json at all
      }
    }

    projects.push({ path: projectPath, encodedDir });

    // Record root deps
    for (const dep of rootDeps) {
      const existing = packageDetails.get(dep);
      if (existing) {
        if (!existing.usedBy.includes(projectPath)) {
          existing.usedBy.push(projectPath);
        }
      } else {
        packageDetails.set(dep, {
          name: dep,
          usedBy: [projectPath],
          isDev: false,
        });
      }
    }

    // Resolve workspaces and read their deps
    if (workspaces.length > 0) {
      const workspaceDirs = await resolveWorkspaces(projectPath, workspaces);
      for (const wsDir of workspaceDirs) {
        const wsPkgPath = join(wsDir, "package.json");
        const { deps: wsDeps } = await readPackageDeps(
          wsPkgPath,
          options.includeDev
        );
        for (const dep of wsDeps) {
          const existing = packageDetails.get(dep);
          if (existing) {
            if (!existing.usedBy.includes(projectPath)) {
              existing.usedBy.push(projectPath);
            }
          } else {
            packageDetails.set(dep, {
              name: dep,
              usedBy: [projectPath],
              isDev: false,
            });
          }
        }
      }
    }
  }

  return {
    projects,
    packages: new Set(packageDetails.keys()),
    packageDetails,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/project-discovery.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/project-discovery.ts src/deps/__tests__/project-discovery.test.ts
git commit -m "feat(scan-deps): add project discovery with workspace support"
```

---

## Task 3: npm Resolver

**Files:**
- Create: `src/deps/__tests__/npm-resolver.test.ts`
- Create: `src/deps/npm-resolver.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/deps/__tests__/npm-resolver.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseGitHubRepo, resolveToGithubRepos } from "../npm-resolver.js";

describe("parseGitHubRepo", () => {
  it("parses git+https URL", () => {
    expect(parseGitHubRepo("git+https://github.com/vercel/next.js.git")).toBe(
      "vercel/next.js"
    );
  });

  it("parses plain https URL", () => {
    expect(parseGitHubRepo("https://github.com/colinhacks/zod")).toBe(
      "colinhacks/zod"
    );
  });

  it("parses github: shorthand", () => {
    expect(parseGitHubRepo("github:jrswab/axe")).toBe("jrswab/axe");
  });

  it("parses git:// URL", () => {
    expect(parseGitHubRepo("git://github.com/lodash/lodash.git")).toBe(
      "lodash/lodash"
    );
  });

  it("parses ssh URL", () => {
    expect(
      parseGitHubRepo("ssh://git@github.com/owner/repo.git")
    ).toBe("owner/repo");
  });

  it("parses bare owner/repo shorthand", () => {
    expect(parseGitHubRepo("owner/repo")).toBe("owner/repo");
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubRepo("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGitHubRepo("")).toBeNull();
  });

  it("strips trailing .git", () => {
    expect(parseGitHubRepo("https://github.com/owner/repo.git")).toBe(
      "owner/repo"
    );
  });
});

describe("resolveToGithubRepos", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves packages to GitHub repos via npm registry", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          repository: {
            type: "git",
            url: "git+https://github.com/get-convex/convex-backend.git",
          },
          description: "The open-source reactive database",
        }),
    }) as any;

    const packageDetails = new Map([
      ["convex", { name: "convex", usedBy: ["/path/a"], isDev: false }],
    ]);

    const result = await resolveToGithubRepos(packageDetails);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].repo).toBe("get-convex/convex-backend");
    expect(result.repos[0].packages).toContain("convex");
  });

  it("deduplicates packages that share a repo (monorepo)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          repository: {
            type: "git",
            url: "git+https://github.com/babel/babel.git",
          },
          description: "Babel compiler",
        }),
    }) as any;

    const packageDetails = new Map([
      ["@babel/core", { name: "@babel/core", usedBy: ["/path/a"], isDev: false }],
      ["@babel/parser", { name: "@babel/parser", usedBy: ["/path/a"], isDev: false }],
    ]);

    const result = await resolveToGithubRepos(packageDetails);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].packages).toContain("@babel/core");
    expect(result.repos[0].packages).toContain("@babel/parser");
  });

  it("skips packages with no GitHub repo", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ repository: undefined }),
    }) as any;

    const packageDetails = new Map([
      ["no-repo-pkg", { name: "no-repo-pkg", usedBy: ["/path/a"], isDev: false }],
    ]);

    const result = await resolveToGithubRepos(packageDetails);
    expect(result.repos).toHaveLength(0);
  });

  it("handles npm network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("ECONNREFUSED")
    ) as any;

    const packageDetails = new Map([
      ["broken-pkg", { name: "broken-pkg", usedBy: ["/path/a"], isDev: false }],
    ]);

    const result = await resolveToGithubRepos(packageDetails);
    expect(result.repos).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ECONNREFUSED");
  });

  it("handles repository field as string shorthand", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          repository: "github:owner/my-repo",
          description: "A repo",
        }),
    }) as any;

    const packageDetails = new Map([
      ["string-repo", { name: "string-repo", usedBy: ["/path/a"], isDev: false }],
    ]);

    const result = await resolveToGithubRepos(packageDetails);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].repo).toBe("owner/my-repo");
  });

  it("handles npm 404 gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as any;

    const packageDetails = new Map([
      ["private-pkg", { name: "private-pkg", usedBy: ["/path/a"], isDev: false }],
    ]);

    const result = await resolveToGithubRepos(packageDetails);
    expect(result.repos).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/npm-resolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement npm resolver**

```typescript
// src/deps/npm-resolver.ts
import { PackageInfo, ResolvedRepo } from "./types.js";

/**
 * Parse a repository URL string into a GitHub owner/repo string.
 * Returns null if the URL is not a GitHub repo.
 */
export function parseGitHubRepo(repoUrl: string): string | null {
  if (!repoUrl) return null;

  let url = repoUrl.trim();

  // Handle "github:owner/repo" shorthand
  if (url.startsWith("github:")) {
    return url.slice("github:".length).replace(/\.git$/, "");
  }

  // Handle bare "owner/repo" shorthand (no protocol, no dots except in .git)
  if (/^[^/:@]+\/[^/:@]+$/.test(url) && !url.includes(".")) {
    return url;
  }

  // Handle various URL formats — extract from github.com path
  const githubMatch = url.match(
    /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?(?:\/.*)?$/
  );
  if (githubMatch) {
    return githubMatch[1];
  }

  return null;
}

interface ResolveResult {
  repos: ResolvedRepo[];
  errors: string[];
}

/**
 * Resolve a map of package names to their GitHub repos via npm registry.
 */
export async function resolveToGithubRepos(
  packageDetails: Map<string, PackageInfo>
): Promise<ResolveResult> {
  const repoMap = new Map<string, ResolvedRepo>();
  const errors: string[] = [];

  for (const [pkgName, pkgInfo] of packageDetails) {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`
      );

      if (!response.ok) {
        errors.push(
          `npm registry ${response.status} for ${pkgName}`
        );
        continue;
      }

      const data = await response.json();

      // repository can be a string or { type, url } object
      let repoUrl: string | null = null;
      if (typeof data.repository === "string") {
        repoUrl = data.repository;
      } else if (data.repository?.url) {
        repoUrl = data.repository.url;
      }

      const ghRepo = repoUrl ? parseGitHubRepo(repoUrl) : null;
      if (!ghRepo) continue;

      const description = data.description || "";

      // Deduplicate: multiple packages may share a repo (monorepos)
      const existing = repoMap.get(ghRepo);
      if (existing) {
        if (!existing.packages.includes(pkgName)) {
          existing.packages.push(pkgName);
        }
        for (const usedBy of pkgInfo.usedBy) {
          if (!existing.usedBy.includes(usedBy)) {
            existing.usedBy.push(usedBy);
          }
        }
      } else {
        repoMap.set(ghRepo, {
          repo: ghRepo,
          repoDescription: description,
          packages: [pkgName],
          usedBy: [...pkgInfo.usedBy],
        });
      }
    } catch (err) {
      errors.push(
        `Failed to resolve ${pkgName}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { repos: Array.from(repoMap.values()), errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/npm-resolver.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/npm-resolver.ts src/deps/__tests__/npm-resolver.test.ts
git commit -m "feat(scan-deps): add npm registry resolver with GitHub URL parsing"
```

---

## Task 4: GitHub Releases Fetcher

**Files:**
- Create: `src/deps/__tests__/github-releases.test.ts`
- Create: `src/deps/github-releases.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/deps/__tests__/github-releases.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRecentReleases } from "../github-releases.js";
import { ResolvedRepo } from "../types.js";

describe("fetchRecentReleases", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  const makeRepo = (repo: string): ResolvedRepo => ({
    repo,
    repoDescription: "test repo",
    packages: ["test-pkg"],
    usedBy: ["/path/a"],
  });

  it("fetches releases within the since window", async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () =>
        Promise.resolve([
          {
            tag_name: "v1.2.0",
            name: "Release 1.2.0",
            published_at: twoDaysAgo.toISOString(),
            body: "New features",
            html_url: "https://github.com/owner/repo/releases/tag/v1.2.0",
          },
          {
            tag_name: "v1.1.0",
            name: "Release 1.1.0",
            published_at: tenDaysAgo.toISOString(),
            body: "Old release",
            html_url: "https://github.com/owner/repo/releases/tag/v1.1.0",
          },
        ]),
    }) as any;

    const result = await fetchRecentReleases([makeRepo("owner/repo")], 7);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].release.tag).toBe("v1.2.0");
  });

  it("uses GITHUB_TOKEN when available", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve([]),
    }) as any;

    await fetchRecentReleases([makeRepo("owner/repo")], 7);

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("handles rate limiting gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ "x-ratelimit-remaining": "0" }),
    }) as any;

    const repos = [makeRepo("owner/repo1"), makeRepo("owner/repo2")];
    const result = await fetchRecentReleases(repos, 7);
    expect(result.rateLimited).toBe(true);
    // Should stop after first rate limit, not try repo2
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("skips repos with 404 errors and continues", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: new Headers(),
        });
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers(),
        json: () =>
          Promise.resolve([
            {
              tag_name: "v2.0.0",
              name: "Release 2.0.0",
              published_at: new Date().toISOString(),
              body: "Latest",
              html_url: "https://github.com/owner/repo2/releases/tag/v2.0.0",
            },
          ]),
      });
    }) as any;

    const repos = [makeRepo("owner/repo1"), makeRepo("owner/repo2")];
    const result = await fetchRecentReleases(repos, 7);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].repo).toBe("owner/repo2");
    expect(result.errors).toHaveLength(1);
  });

  it("handles 429 rate limiting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
    }) as any;

    const repos = [makeRepo("owner/repo1"), makeRepo("owner/repo2")];
    const result = await fetchRecentReleases(repos, 7);
    expect(result.rateLimited).toBe(true);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: () => Promise.resolve([]),
      }) as any;

    const repos = [makeRepo("owner/repo1"), makeRepo("owner/repo2")];
    const result = await fetchRecentReleases(repos, 7);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ECONNREFUSED");
  });

  it("returns empty for repos with no releases", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve([]),
    }) as any;

    const result = await fetchRecentReleases([makeRepo("owner/repo")], 7);
    expect(result.releases).toHaveLength(0);
    expect(result.reposWithoutReleases).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/github-releases.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement GitHub releases fetcher**

```typescript
// src/deps/github-releases.ts
import { ResolvedRepo, ReleaseEntry } from "./types.js";

interface FetchReleasesResult {
  releases: ReleaseEntry[];
  reposWithoutReleases: number;
  rateLimited: boolean;
  errors: string[];
}

/**
 * Fetch recent GitHub releases for a list of resolved repos.
 */
export async function fetchRecentReleases(
  repos: ResolvedRepo[],
  sinceDays: number
): Promise<FetchReleasesResult> {
  const releases: ReleaseEntry[] = [];
  const errors: string[] = [];
  let reposWithoutReleases = 0;
  let rateLimited = false;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  for (const resolvedRepo of repos) {
    if (rateLimited) break;

    try {
      const response = await fetch(
        `https://api.github.com/repos/${resolvedRepo.repo}/releases?per_page=10`,
        { headers }
      );

      if (!response.ok) {
        // Check for rate limiting
        if (
          response.status === 403 ||
          response.status === 429
        ) {
          const remaining = response.headers.get("x-ratelimit-remaining");
          if (remaining === "0" || response.status === 429) {
            rateLimited = true;
            errors.push(
              `GitHub rate limit hit after ${releases.length} releases fetched. ` +
              `${repos.indexOf(resolvedRepo)} of ${repos.length} repos processed.`
            );
            break;
          }
        }

        errors.push(
          `GitHub ${response.status} for ${resolvedRepo.repo}`
        );
        continue;
      }

      const ghReleases = await response.json();

      if (!Array.isArray(ghReleases) || ghReleases.length === 0) {
        reposWithoutReleases++;
        continue;
      }

      let hasRecentRelease = false;
      for (const ghRelease of ghReleases) {
        const publishedAt = new Date(ghRelease.published_at);
        if (publishedAt < sinceDate) continue;

        hasRecentRelease = true;
        releases.push({
          packages: [...resolvedRepo.packages],
          repo: resolvedRepo.repo,
          repoDescription: resolvedRepo.repoDescription,
          release: {
            tag: ghRelease.tag_name,
            name: ghRelease.name || ghRelease.tag_name,
            publishedAt: ghRelease.published_at,
            body: ghRelease.body || "",
            url: ghRelease.html_url,
          },
          usedBy: [...resolvedRepo.usedBy],
        });
      }

      if (!hasRecentRelease) {
        reposWithoutReleases++;
      }
    } catch (err) {
      errors.push(
        `Failed to fetch releases for ${resolvedRepo.repo}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return { releases, reposWithoutReleases, rateLimited, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/deps/__tests__/github-releases.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/github-releases.ts src/deps/__tests__/github-releases.test.ts
git commit -m "feat(scan-deps): add GitHub releases fetcher with rate limit handling"
```

---

## Task 5: scan-deps Command + CLI Registration

**Files:**
- Create: `src/commands/scan-deps.ts`
- Modify: `src/cli.ts:93` (before the `publish` command)
- Create: `src/commands/__tests__/scan-deps.test.ts`

- [ ] **Step 1: Write failing integration test**

```typescript
// src/commands/__tests__/scan-deps.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { scanDeps } from "../scan-deps.js";

describe("scanDeps", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("produces valid output structure with empty projects dir", async () => {
    const result = await scanDeps({
      projectsBasePath: "/tmp/nonexistent-dir",
      sinceDays: 7,
      includeDev: false,
    });

    expect(result.scannedAt).toBeDefined();
    expect(result.projectCount).toBe(0);
    expect(result.packageCount).toBe(0);
    expect(result.reposResolved).toBe(0);
    expect(result.releases).toEqual([]);
    expect(result.rateLimited).toBe(false);
    expect(result.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/commands/__tests__/scan-deps.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement scan-deps command**

```typescript
// src/commands/scan-deps.ts
import { discoverProjectDeps } from "../deps/project-discovery.js";
import { resolveToGithubRepos } from "../deps/npm-resolver.js";
import { fetchRecentReleases } from "../deps/github-releases.js";
import { ScanDepsOutput } from "../deps/types.js";

interface ScanDepsCommandOptions {
  projectsBasePath: string;
  sinceDays: number;
  includeDev: boolean;
}

/**
 * Main orchestrator for the scan-deps command.
 * Discovers projects → resolves deps to GitHub repos → fetches releases.
 */
export async function scanDeps(
  options: ScanDepsCommandOptions
): Promise<ScanDepsOutput> {
  const allErrors: string[] = [];

  // Step 1+2: Discover projects and their deps
  const discovery = await discoverProjectDeps(options.projectsBasePath, {
    includeDev: options.includeDev,
  });

  if (discovery.packages.size === 0) {
    return {
      scannedAt: new Date().toISOString(),
      projectCount: discovery.projects.length,
      packageCount: 0,
      reposResolved: 0,
      reposWithoutReleases: 0,
      rateLimited: false,
      errors: [],
      releases: [],
    };
  }

  // Step 3: Resolve packages to GitHub repos
  const { repos, errors: resolveErrors } = await resolveToGithubRepos(
    discovery.packageDetails
  );
  allErrors.push(...resolveErrors);

  // Step 4: Fetch recent releases
  const {
    releases,
    reposWithoutReleases,
    rateLimited,
    errors: fetchErrors,
  } = await fetchRecentReleases(repos, options.sinceDays);
  allErrors.push(...fetchErrors);

  return {
    scannedAt: new Date().toISOString(),
    projectCount: discovery.projects.length,
    packageCount: discovery.packages.size,
    reposResolved: repos.length,
    reposWithoutReleases,
    rateLimited,
    errors: allErrors,
    releases,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Development/workflow-analyzer && npx vitest run src/commands/__tests__/scan-deps.test.ts`
Expected: PASS

- [ ] **Step 5: Register scan-deps in CLI**

Add the following to `src/cli.ts`, after the `parse` command block (line 91) and before the `publish` command block (line 93):

```typescript
program
  .command("scan-deps")
  .description("Scan project dependencies for recent GitHub releases")
  .option("--since <days>", "Number of days to look back for releases", "7")
  .option("--include-dev", "Include devDependencies (default: production only)")
  .option("-o, --output <path>", "Output JSON file path")
  .action(async (opts) => {
    // Dynamic import to avoid loading deps module tree for other commands
    const { scanDeps } = await import("./commands/scan-deps.js");
    const config = await loadConfig(undefined); // loadConfig already imported at top of cli.ts

    const projectsBasePath =
      config.sources["claude-code"]?.path || "~/.claude/projects";

    const result = await scanDeps({
      projectsBasePath,
      sinceDays: parseInt(opts.since, 10),
      includeDev: !!opts.includeDev,
    });

    const json = JSON.stringify(result, null, 2);

    if (opts.output) {
      const { writeFile } = await import("fs/promises");
      await writeFile(opts.output, json, "utf-8");
      console.log(
        `Scanned ${result.projectCount} projects, ${result.packageCount} packages, ` +
        `${result.reposResolved} repos → ${result.releases.length} releases → ${opts.output}`
      );
    } else {
      console.log(json);
    }

    if (result.rateLimited) {
      console.error("Warning: GitHub rate limit reached. Results may be incomplete.");
    }
    if (result.errors.length > 0) {
      console.error(`${result.errors.length} errors encountered (see errors field in output).`);
    }
  });
```

Also add the import at the top of `src/cli.ts` — actually, since we're using dynamic `import()` in the action handler, no static import is needed.

- [ ] **Step 6: Run all tests**

Run: `cd ~/Development/workflow-analyzer && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Build and verify CLI help**

Run: `cd ~/Development/workflow-analyzer && npm run build && node dist/cli.js scan-deps --help`
Expected: Shows scan-deps usage with `--since`, `--include-dev`, `-o` options

- [ ] **Step 8: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/commands/scan-deps.ts src/commands/__tests__/scan-deps.test.ts src/cli.ts
git commit -m "feat(scan-deps): add scan-deps CLI command with full pipeline"
```

---

## Task 6: Update barrel export + Fix index.ts imports

**Files:**
- Modify: `src/deps/index.ts`
- Modify: `src/index.ts` (workflow-analyzer main export)

- [ ] **Step 1: Verify barrel export is correct**

Read `src/deps/index.ts` and confirm all three modules are exported. If the barrel file written in Task 1 has import errors now that the modules exist, verify it compiles.

- [ ] **Step 2: Add deps export to main index.ts**

Add to `src/index.ts`:

```typescript
export { scanDeps } from "./commands/scan-deps.js";
export * from "./deps/types.js";
```

- [ ] **Step 3: Build and verify**

Run: `cd ~/Development/workflow-analyzer && npm run build`
Expected: Clean compile, no errors

- [ ] **Step 4: Commit**

```bash
cd ~/Development/workflow-analyzer
git add src/deps/index.ts src/index.ts
git commit -m "feat(scan-deps): export scan-deps from package public API"
```

---

## Task 7: Update Scout SKILL.md

**Files:**
- Modify: `plugins/workflow-analyst/skills/scout/SKILL.md` (in claude-workflow-analyst repo)

- [ ] **Step 1: Add Step 2.5 and update source enum**

In `~/Development/claude-workflow-analyst/plugins/workflow-analyst/skills/scout/SKILL.md`:

After the `### Step 2: Load Existing Catalogue` section and before `### Step 3: Scan Structured Sources`, insert:

```markdown
### Step 2.5: Scan Project Dependencies

Run `npx @flippyhead/workflow-analyzer@latest scan-deps --since ${DAYS} --output /tmp/workflow-analyzer-deps.json`. Read the output JSON.

If the command fails or is not available, log a warning and skip to Step 3 — dependency scanning is additive, not required.

For each entry in the `releases` array:
1. Read the `release.body` (release notes) and `repoDescription` to assess relevance
2. **Skip** routine releases: patch version bumps, typo fixes, minor dep updates, internal refactors, CI/CD changes, documentation-only releases
3. **Catalogue** interesting releases: new CLI tools, MCP servers/integrations, AI/agent features, breaking changes, significant new APIs, performance improvements
4. Create catalogue items using the standard enrichment from Step 5, with `source: "dependency-changelog"` and an additional `relevanceHint` of `"direct dependency"`
5. Use the `release.url` as the item URL for deduplication against existing catalogue
```

In the Step 5 source enum, add `dependency-changelog`:

```
  "source": "<one of: anthropic-changelog, hackernews, github, youtube, manual, dependency-changelog>",
```

- [ ] **Step 2: Verify skill loads correctly**

Read the modified file and confirm the markdown structure is valid and step numbering is consistent.

- [ ] **Step 3: Commit (in claude-workflow-analyst repo)**

```bash
cd ~/Development/claude-workflow-analyst
git add plugins/workflow-analyst/skills/scout/SKILL.md
git commit -m "feat(scout): add dependency changelog scanning via scan-deps command"
```

---

## Task 8: Bump Versions

**Files:**
- Modify: `.claude-plugin/plugin.json` (claude-workflow-analyst)
- Modify: `.claude-plugin/marketplace.json` (claude-workflow-analyst)
- Modify: `plugins/workflow-analyst/.claude-plugin/plugin.json` (claude-workflow-analyst)

Per CLAUDE.md versioning rules, this is a minor bump (new feature).

- [ ] **Step 1: Read current versions and bump**

Read all three version files, identify current version, bump minor.

- [ ] **Step 2: Update all three files**

Ensure all three stay in sync with the new minor version.

- [ ] **Step 3: Commit**

```bash
cd ~/Development/claude-workflow-analyst
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json plugins/workflow-analyst/.claude-plugin/plugin.json
git commit -m "chore: bump versions for scan-deps feature"
```

---

## Task 9: End-to-End Smoke Test

- [ ] **Step 1: Build and publish locally**

```bash
cd ~/Development/workflow-analyzer
npm run build
```

- [ ] **Step 2: Run scan-deps against real projects**

```bash
cd ~/Development/workflow-analyzer
node dist/cli.js scan-deps --since 30 --output /tmp/workflow-analyzer-deps.json
```

Expected: JSON output with real projects discovered, packages resolved, and some releases found.

- [ ] **Step 3: Verify output structure**

Read `/tmp/workflow-analyzer-deps.json` and confirm:
- `projectCount` > 0
- `packageCount` > 0
- `reposResolved` > 0
- `releases` array contains entries with valid structure
- No unexpected errors in `errors` array

- [ ] **Step 4: Run full test suite**

```bash
cd ~/Development/workflow-analyzer
npx vitest run
```

Expected: All tests PASS
