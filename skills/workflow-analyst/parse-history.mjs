#!/usr/bin/env node

/**
 * Parses ~/.claude/history.jsonl to extract prompt frequency and project activity.
 *
 * Export: parseHistory(content, since?)
 * CLI:    node parse-history.mjs [--days N]
 */

export function parseHistory(content, since) {
  const sinceMs = since ? since.getTime() : 0;
  const promptCounts = new Map();
  const projectCounts = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (sinceMs && entry.timestamp < sinceMs) continue;

    const prompt = entry.display;
    if (prompt) {
      promptCounts.set(prompt, (promptCounts.get(prompt) || 0) + 1);
    }

    const project = entry.project;
    if (project) {
      projectCounts[project] = (projectCounts[project] || 0) + 1;
    }
  }

  const frequentPrompts = [...promptCounts.entries()]
    .map(([prompt, count]) => ({ prompt, count }))
    .sort((a, b) => b.count - a.count);

  return { frequentPrompts, projectActivity: projectCounts };
}

// CLI entry point
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*(?=\/)/, ''));

if (isMain) {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');

  const args = process.argv.slice(2);
  let days = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
    }
  }

  const historyPath = join(homedir(), '.claude', 'history.jsonl');
  let content;
  try {
    content = readFileSync(historyPath, 'utf-8');
  } catch (err) {
    console.error(`Could not read ${historyPath}: ${err.message}`);
    process.exit(1);
  }

  const since = days ? new Date(Date.now() - days * 86400000) : undefined;
  const result = parseHistory(content, since);
  console.log(JSON.stringify(result, null, 2));
}
