import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Find the tool name for a given tool_use_id by searching assistant message content blocks.
 */
export function findToolNameByUseId(entries, toolUseId) {
  for (const entry of entries) {
    if (entry.message?.role === 'assistant' && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_use' && block.id === toolUseId) {
          return block.name;
        }
      }
    }
  }
  return null;
}

/**
 * Parse a single JSONL session file content into a structured summary.
 */
export function parseSession(content, projectPath) {
  const lines = content.trim().split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  let sessionId = null;
  let gitBranch = null;
  let version = null;
  let model = null;
  let startTime = null;
  let endTime = null;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  const toolUsage = {};        // { [toolName]: { calls, successes, failures } }
  const permissionDeniedTools = new Set();
  let permissionDenials = 0;
  const userPrompts = [];
  const skillsInvoked = [];

  // Track tool calls and results for retry detection
  const toolCallSequence = []; // { tool, success }

  for (const entry of entries) {
    // Extract metadata from first entry that has it
    if (entry.sessionId && !sessionId) sessionId = entry.sessionId;
    if (entry.gitBranch && !gitBranch) gitBranch = entry.gitBranch;
    if (entry.version && !version) version = entry.version;

    // Track timestamps
    if (entry.timestamp) {
      if (!startTime || entry.timestamp < startTime) startTime = entry.timestamp;
      if (!endTime || entry.timestamp > endTime) endTime = entry.timestamp;
    }

    // User messages — real data uses type:"user", fixtures use type:"human"
    // Distinguish user messages from tool results by checking content type
    if ((entry.type === 'human' || entry.type === 'user') && entry.message?.role === 'user') {
      const msgContent = entry.message.content;
      const isToolResult = Array.isArray(msgContent) &&
        msgContent.length > 0 &&
        msgContent[0]?.type === 'tool_result';

      if (!isToolResult) {
        userMessageCount++;
        const text = typeof msgContent === 'string' ? msgContent : '';
        if (text) {
          userPrompts.push(text.slice(0, 100));
        }
      }
    }

    // Assistant messages — extract tool calls and model
    if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
      assistantMessageCount++;
      if (entry.message.model && !model) {
        model = entry.message.model;
      }
      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            const toolName = block.name;
            if (!toolUsage[toolName]) {
              toolUsage[toolName] = { calls: 0, successes: 0, failures: 0 };
            }
            toolUsage[toolName].calls++;
            if (toolName === 'Skill') {
              skillsInvoked.push(block.input);
            }
          }
        }
      }
    }

    // Tool results — handle both type:"tool_result" (fixtures) and type:"user" (real data)
    const isToolResultEntry =
      (entry.type === 'tool_result' || entry.type === 'user') &&
      Array.isArray(entry.message?.content) &&
      entry.message.content.length > 0 &&
      entry.message.content[0]?.type === 'tool_result';

    if (isToolResultEntry) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const toolName = findToolNameByUseId(entries, block.tool_use_id);
          if (!toolName) continue;

          const isError = block.is_error === true;
          const contentStr = typeof block.content === 'string' ? block.content : '';
          const isDenied = isError && contentStr.toLowerCase().includes('denied');

          if (isError) {
            if (toolUsage[toolName]) toolUsage[toolName].failures++;
            if (isDenied) {
              permissionDenials++;
              permissionDeniedTools.add(toolName);
            }
          } else {
            if (toolUsage[toolName]) toolUsage[toolName].successes++;
          }

          toolCallSequence.push({ tool: toolName, success: !isError });
        }
      }
    }
  }

  // Detect retry sequences: consecutive failed calls of the same tool
  const retrySequences = [];
  let i = 0;
  while (i < toolCallSequence.length) {
    if (!toolCallSequence[i].success) {
      const tool = toolCallSequence[i].tool;
      let count = 1;
      let j = i + 1;
      while (j < toolCallSequence.length && toolCallSequence[j].tool === tool && !toolCallSequence[j].success) {
        count++;
        j++;
      }
      if (count >= 2) {
        retrySequences.push({ tool, count });
      }
      i = j;
    } else {
      i++;
    }
  }

  // Duration
  let durationMinutes = 0;
  if (startTime && endTime) {
    durationMinutes = (new Date(endTime) - new Date(startTime)) / 60000;
  }

  return {
    sessionId,
    project: projectPath,
    gitBranch,
    version,
    model,
    startTime,
    endTime,
    durationMinutes,
    userMessageCount,
    assistantMessageCount,
    toolUsage,
    retrySequences,
    permissionDenials,
    deniedTools: [...permissionDeniedTools],
    skillsInvoked,
    userPrompts,
  };
}

/**
 * Aggregate multiple session results into summary statistics.
 */
export function aggregateSessions(sessions) {
  const totalSessions = sessions.length;
  let totalUserMessages = 0;
  let totalPermissionDenials = 0;
  let totalRetrySequences = 0;
  const projectBreakdown = {};
  const toolUsageTotal = {};
  const timeOfDayDistribution = {};
  const modelUsage = {};

  // Initialize 24-hour buckets
  for (let h = 0; h < 24; h++) {
    timeOfDayDistribution[h] = 0;
  }

  for (const session of sessions) {
    totalUserMessages += session.userMessageCount;
    totalPermissionDenials += session.permissionDenials;
    totalRetrySequences += session.retrySequences.length;

    // Project breakdown
    if (!projectBreakdown[session.project]) {
      projectBreakdown[session.project] = { sessions: 0, userMessages: 0, tools: {} };
    }
    projectBreakdown[session.project].sessions++;
    projectBreakdown[session.project].userMessages += session.userMessageCount;

    // Tool usage
    for (const [tool, usage] of Object.entries(session.toolUsage)) {
      if (!toolUsageTotal[tool]) {
        toolUsageTotal[tool] = { calls: 0, successes: 0, failures: 0 };
      }
      toolUsageTotal[tool].calls += usage.calls;
      toolUsageTotal[tool].successes += usage.successes;
      toolUsageTotal[tool].failures += usage.failures;

      // Also add to project breakdown
      if (!projectBreakdown[session.project].tools[tool]) {
        projectBreakdown[session.project].tools[tool] = { calls: 0 };
      }
      projectBreakdown[session.project].tools[tool].calls += usage.calls;
    }

    // Time of day
    if (session.startTime) {
      const hour = new Date(session.startTime).getUTCHours();
      timeOfDayDistribution[hour]++;
    }

    // Model usage
    if (session.model) {
      modelUsage[session.model] = (modelUsage[session.model] || 0) + 1;
    }
  }

  // Top retries across all sessions
  const allRetries = sessions.flatMap(s => s.retrySequences);
  const topRetries = allRetries.sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    totalSessions,
    totalUserMessages,
    totalPermissionDenials,
    totalRetrySequences,
    projectBreakdown,
    toolUsageTotal,
    timeOfDayDistribution,
    modelUsage,
    topRetries,
    sessionsData: sessions,
  };
}

/**
 * Recursively find .jsonl files modified since a given date.
 */
export function findRecentSessions(dir, since) {
  const results = [];
  const sinceTime = since.getTime();

  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = statSync(fullPath);
          if (stat.mtimeMs >= sinceTime) {
            results.push(fullPath);
          }
        } catch {
          // skip inaccessible files
        }
      }
    }
  }

  walk(dir);
  return results;
}

// CLI entry point
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  let days = 7;
  const daysIdx = args.indexOf('--days');
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    days = parseInt(args[daysIdx + 1], 10);
  }

  let outputPath = null;
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputPath = args[outputIdx + 1];
  }

  const projectsDir = join(homedir(), '.claude', 'projects');
  const since = new Date(Date.now() - days * 86400000);

  try {
    const files = await findRecentSessions(projectsDir, since);
    const sessions = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        // Derive project path from file location
        // Files are at ~/.claude/projects/<encoded-project-path>/<sessionId>.jsonl
        const relToProjects = file.slice(projectsDir.length + 1);
        const parts = relToProjects.split('/');
        const projectEncoded = parts.length > 1 ? parts[0] : 'unknown';
        const projectPath = projectEncoded.replace(/-/g, '/');

        const session = parseSession(content, projectPath);
        if (session.sessionId) {
          sessions.push(session);
        }
      } catch {
        // skip unparseable files
      }
    }

    const aggregate = aggregateSessions(sessions);
    // Exclude individual session data from CLI output to keep it compact
    const { sessionsData, ...compactAggregate } = aggregate;
    const output = JSON.stringify(compactAggregate, null, 2);

    if (outputPath) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(outputPath, output);
      console.error(`Output written to ${outputPath}`);
    } else {
      console.log(output);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
