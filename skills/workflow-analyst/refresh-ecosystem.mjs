#!/usr/bin/env node

/**
 * Gathers data about the Claude Code ecosystem (plugins, MCP servers, skills)
 * from local files and public registries, then writes a cache JSON.
 *
 * CLI: node refresh-ecosystem.mjs [--sessions-json path] [--history-json path]
 * Output: /tmp/workflow-analyst-ecosystem-cache.json
 * Always exits 0; failures logged to stderr.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sessions-json' && args[i + 1]) {
      opts.sessionsJson = args[++i];
    } else if (args[i] === '--history-json' && args[i + 1]) {
      opts.historyJson = args[++i];
    }
  }
  return opts;
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 1. Installed plugins
// ---------------------------------------------------------------------------

function getInstalledPlugins() {
  const data = readJSON(join(HOME, '.claude', 'plugins', 'installed_plugins.json'));
  if (!data?.plugins) return [];
  const results = [];
  for (const [key, entries] of Object.entries(data.plugins)) {
    const [name, marketplace] = key.split('@');
    const entry = Array.isArray(entries) ? entries[0] : entries;
    results.push({
      name,
      marketplace: marketplace || 'unknown',
      version: entry?.version || null,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 2. Install counts (popularity)
// ---------------------------------------------------------------------------

function getInstallCounts() {
  const data = readJSON(join(HOME, '.claude', 'plugins', 'install-counts-cache.json'));
  if (!data?.counts) return new Map();
  const map = new Map();
  for (const { plugin, unique_installs } of data.counts) {
    map.set(plugin, unique_installs);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 3. Installed skills
// ---------------------------------------------------------------------------

function getInstalledSkills() {
  const skillsDir = join(HOME, '.claude', 'skills');
  const results = [];
  try {
    const dirs = readdirSync(skillsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const skillMdPath = join(skillsDir, d.name, 'SKILL.md');
      try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const fm = parseYamlFrontmatter(content);
        results.push({
          name: fm.name || d.name,
          description: fm.description || '',
        });
      } catch {
        // No SKILL.md — skip
      }
    }
  } catch {
    // skills dir doesn't exist
  }
  return results;
}

// ---------------------------------------------------------------------------
// 4. Tech stack inference from session data
// ---------------------------------------------------------------------------

const FRAMEWORK_MAP = {
  'react': 'react', 'react-dom': 'react',
  'next': 'next.js',
  'vue': 'vue',
  'nuxt': 'nuxt',
  'angular': 'angular',
  'svelte': 'svelte',
  'express': 'express',
  'fastify': 'fastify',
  'convex': 'convex',
  'prisma': 'prisma',
  'drizzle': 'drizzle',
  'tailwindcss': 'tailwind',
  'vite': 'vite',
  'jest': 'jest',
  'vitest': 'vitest',
  'playwright': 'playwright',
  'cypress': 'cypress',
  'stripe': 'stripe',
  'firebase': 'firebase',
  'supabase': 'supabase',
};

/**
 * Resolve encoded project directory names from ~/.claude/projects/ to real paths.
 * The encoding replaces '/' with '-', but path components can also contain hyphens,
 * so we scan the projects directory and verify each candidate against the filesystem.
 */
function resolveProjectPaths(projectBreakdown) {
  const projectsDir = join(HOME, '.claude', 'projects');
  const resolved = new Map(); // encodedName -> realPath

  try {
    const encodedDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const encodedDir of encodedDirs) {
      // Try to match this encoded dir to a real filesystem path.
      // The encoded form is like: -Users-peterbrown-Development-ai-brain
      // We try progressively joining segments with hyphens to find existing paths.
      const segments = encodedDir.split('-').filter(Boolean);
      const realPath = '/' + segments.join('/');

      // Fast path: if the naive decode exists, use it
      if (existsSync(realPath)) {
        resolved.set(realPath, realPath);
        continue;
      }

      // Slow path: try to reconstruct by checking which segments should be hyphenated.
      // Walk from left to right, greedily extending the current segment with hyphens.
      let current = '/';
      let remaining = [...segments];
      let valid = true;

      while (remaining.length > 0) {
        let found = false;
        // Try longest possible hyphenated segment first
        for (let len = remaining.length; len >= 1; len--) {
          const candidate = remaining.slice(0, len).join('-');
          const candidatePath = join(current, candidate);
          if (existsSync(candidatePath)) {
            current = candidatePath;
            remaining = remaining.slice(len);
            found = true;
            break;
          }
        }
        if (!found) {
          // Fall back to single segment
          current = join(current, remaining[0]);
          remaining = remaining.slice(1);
          if (!existsSync(current) && remaining.length > 0) {
            valid = false;
            break;
          }
        }
      }

      if (valid && existsSync(current)) {
        // Map the broken decoded path (as it appears in session data) to the real path
        const brokenPath = '/' + segments.join('/');
        resolved.set(brokenPath, current);
      }
    }
  } catch {
    // projects dir doesn't exist
  }

  return resolved;
}

function inferTechStack(projectBreakdown) {
  const techSet = new Set();
  const activeProjects = [];

  // Build a map from broken decoded paths to real filesystem paths
  const pathMap = resolveProjectPaths(projectBreakdown);

  for (const decodedPath of Object.keys(projectBreakdown || {})) {
    // Look up the real path; fall back to the decoded path if no match found
    const projectPath = pathMap.get(decodedPath) || decodedPath;
    const lastSegment = projectPath.split('/').filter(Boolean).pop();
    if (lastSegment) activeProjects.push(lastSegment);

    if (!existsSync(projectPath)) continue;

    // Check for package.json
    const pkgPath = join(projectPath, 'package.json');
    const pkg = readJSON(pkgPath);
    if (pkg) {
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const dep of Object.keys(allDeps)) {
        if (FRAMEWORK_MAP[dep]) {
          techSet.add(FRAMEWORK_MAP[dep]);
        }
      }
      if (allDeps.typescript) {
        techSet.add('typescript');
      }
    }

    // Check for Cargo.toml
    if (existsSync(join(projectPath, 'Cargo.toml'))) {
      techSet.add('rust');
    }

    // Check for Python
    if (existsSync(join(projectPath, 'pyproject.toml'))) {
      techSet.add('python');
    } else if (existsSync(join(projectPath, 'requirements.txt'))) {
      techSet.add('python');
    }

    // Check for Go
    if (existsSync(join(projectPath, 'go.mod'))) {
      techSet.add('go');
    }
  }

  return { techStack: [...techSet], activeProjects };
}

// ---------------------------------------------------------------------------
// 5. Prompt theme extraction from history data
// ---------------------------------------------------------------------------

const THEME_KEYWORDS = {
  'PR review': ['review', 'pr', 'pull request', 'code review'],
  'deploy': ['deploy', 'deployment', 'ship', 'release', 'publish'],
  'test': ['test', 'testing', 'spec', 'coverage'],
  'debug': ['debug', 'fix', 'bug', 'error', 'issue'],
  'refactor': ['refactor', 'clean', 'simplify', 'reorganize'],
  'docs': ['doc', 'readme', 'documentation', 'comment'],
  'UI/frontend': ['ui', 'frontend', 'component', 'css', 'style', 'design'],
  'API/backend': ['api', 'endpoint', 'server', 'backend', 'route'],
  'database': ['database', 'db', 'schema', 'migration', 'query'],
  'CI': ['ci', 'github actions', 'workflow', 'pipeline'],
};

function extractPromptThemes(frequentPrompts) {
  const themeCounts = {};
  for (const { prompt, count } of (frequentPrompts || [])) {
    const lower = prompt.toLowerCase();
    for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        themeCounts[theme] = (themeCounts[theme] || 0) + count;
      }
    }
  }
  return Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme);
}

// ---------------------------------------------------------------------------
// 6. MCP server health from Cowork sessions
// ---------------------------------------------------------------------------

function getMcpServerHealth() {
  const coworkDir = join(HOME, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions');
  const health = { connected: [], failed: [], needsAuth: [] };
  const installedServers = [];

  try {
    const orgDirs = readdirSync(coworkDir, { withFileTypes: true });
    let latestMeta = null;
    let latestTime = 0;
    let latestMetaDir = null;

    // Walk org-id / agent-id directories to find metadata JSONs
    for (const orgDir of orgDirs) {
      if (!orgDir.isDirectory()) continue;
      const orgPath = join(coworkDir, orgDir.name);
      try {
        const agentDirs = readdirSync(orgPath, { withFileTypes: true });
        for (const agentDir of agentDirs) {
          if (!agentDir.isDirectory()) continue;
          const agentPath = join(orgPath, agentDir.name);
          try {
            const files = readdirSync(agentPath, { withFileTypes: true });
            for (const f of files) {
              if (!f.isFile() || !f.name.startsWith('local_') || !f.name.endsWith('.json')) continue;
              try {
                const meta = readJSON(join(agentPath, f.name));
                if (meta?.lastActivityAt) {
                  const t = new Date(meta.lastActivityAt).getTime();
                  if (t > latestTime) {
                    latestTime = t;
                    latestMeta = meta;
                    // The audit log directory has the same name without .json
                    latestMetaDir = join(agentPath, f.name.replace('.json', ''));
                  }
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    // Extract server names from remoteMcpServersConfig (array of {name, ...})
    if (latestMeta?.remoteMcpServersConfig) {
      const config = latestMeta.remoteMcpServersConfig;
      if (Array.isArray(config)) {
        for (const server of config) {
          if (server?.name) {
            installedServers.push({ name: server.name, source: 'cowork' });
          }
        }
      } else if (typeof config === 'object') {
        for (const name of Object.keys(config)) {
          installedServers.push({ name, source: 'cowork' });
        }
      }
    }

    // Read audit.jsonl for init entry with mcp_servers status
    if (latestMetaDir) {
      try {
        const auditContent = readFileSync(join(latestMetaDir, 'audit.jsonl'), 'utf-8');
        for (const line of auditContent.split('\n')) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.mcp_servers && Array.isArray(entry.mcp_servers)) {
              for (const server of entry.mcp_servers) {
                const sName = server.name || server.id || 'unknown';
                if (server.status === 'connected') health.connected.push(sName);
                else if (server.status === 'failed') health.failed.push(sName);
                else if (server.status === 'needs-auth') health.needsAuth.push(sName);
              }
              break; // Only need the first/init entry
            }
          } catch { /* skip line */ }
        }
      } catch { /* no audit log */ }
    }
  } catch {
    // cowork dir doesn't exist
  }

  return { health, installedServers };
}

// ---------------------------------------------------------------------------
// 7. MCP Registry (network)
// ---------------------------------------------------------------------------

async function fetchMcpRegistry() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      'https://registry.modelcontextprotocol.io/v0/servers?limit=50',
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const servers = (data.servers || []).map(entry => {
      const s = entry.server || entry;
      return {
        name: s.name || '',
        description: s.description || '',
        source: 'registry',
      };
    }).filter(s => s.name);

    // Deduplicate by server name
    const seen = new Map();
    for (const s of servers) {
      if (!seen.has(s.name)) {
        seen.set(s.name, s);
      }
    }
    return [...seen.values()];
  } catch (err) {
    console.error(`MCP registry fetch failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  // 1. Installed plugins
  const installedPlugins = getInstalledPlugins();

  // 2. Install counts
  const installCounts = getInstallCounts();

  // Enrich installed plugins with install counts
  const installedPluginsEnriched = installedPlugins.map(p => ({
    ...p,
    installs: installCounts.get(`${p.name}@${p.marketplace}`) || 0,
  }));

  // Available plugins: > 1000 installs, not already installed
  const installedKeys = new Set(installedPlugins.map(p => `${p.name}@${p.marketplace}`));
  const availablePlugins = [];
  for (const [key, count] of installCounts) {
    if (count < 1000) continue;
    if (installedKeys.has(key)) continue;
    const [name, marketplace] = key.split('@');
    availablePlugins.push({ name, marketplace: marketplace || 'unknown', installs: count });
  }
  availablePlugins.sort((a, b) => b.installs - a.installs);

  // 3. Installed skills
  const installedSkills = getInstalledSkills();

  // 4. Tech stack (if sessions data provided)
  let techStack = [];
  let activeProjects = [];
  if (opts.sessionsJson) {
    try {
      const sessionsData = readJSON(opts.sessionsJson);
      if (sessionsData?.projectBreakdown) {
        const result = inferTechStack(sessionsData.projectBreakdown);
        techStack = result.techStack;
        activeProjects = result.activeProjects;
      }
    } catch (err) {
      console.error(`Sessions data error: ${err.message}`);
    }
  }

  // 5. Prompt themes (if history data provided)
  let frequentPromptThemes = [];
  if (opts.historyJson) {
    try {
      const historyData = readJSON(opts.historyJson);
      if (historyData?.frequentPrompts) {
        frequentPromptThemes = extractPromptThemes(historyData.frequentPrompts);
      }
    } catch (err) {
      console.error(`History data error: ${err.message}`);
    }
  }

  // 6. MCP server health
  const { health: mcpServerHealth, installedServers } = getMcpServerHealth();

  // 7. MCP registry (network)
  const registryServers = await fetchMcpRegistry();

  // Build cache
  const cache = {
    refreshedAt: new Date().toISOString(),
    userContext: {
      techStack,
      activeProjects,
      frequentPromptThemes,
      mcpServerHealth,
    },
    plugins: {
      available: availablePlugins,
      installed: installedPluginsEnriched,
    },
    mcpServers: {
      available: registryServers,
      installed: installedServers,
    },
    skills: {
      available: [],
      installed: installedSkills,
    },
  };

  // Write cache file
  const cachePath = join('/tmp', 'workflow-analyst-ecosystem-cache.json');
  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.error(`Cache written to ${cachePath}`);
  } catch (err) {
    console.error(`Failed to write cache: ${err.message}`);
  }

  // Print summary to stdout
  const summary = {
    refreshedAt: cache.refreshedAt,
    plugins: { available: availablePlugins.length, installed: installedPluginsEnriched.length },
    mcpServers: { available: registryServers.length, installed: installedServers.length },
    skills: { available: 0, installed: installedSkills.length },
    techStack,
    activeProjects,
    promptThemes: frequentPromptThemes,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(`Unexpected error: ${err.message}`);
}).finally(() => {
  process.exit(0);
});
