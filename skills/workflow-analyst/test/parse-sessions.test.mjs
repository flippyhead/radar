import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSession, aggregateSessions, findRecentSessions } from '../parse-sessions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

const simpleContent = readFileSync(join(fixturesDir, 'simple-session.jsonl'), 'utf-8');
const errorContent = readFileSync(join(fixturesDir, 'error-session.jsonl'), 'utf-8');

describe('parseSession', () => {
  it('extracts session metadata', () => {
    const result = parseSession(simpleContent, '/Users/test/project-a');
    assert.equal(result.sessionId, 'test-session-001');
    assert.equal(result.project, '/Users/test/project-a');
    assert.equal(result.gitBranch, 'main');
    assert.equal(result.version, '2.1.71');
    assert.equal(result.startTime, '2026-03-01T09:00:00.000Z');
    assert.equal(result.endTime, '2026-03-01T09:01:10.000Z');
    assert.ok(typeof result.durationMinutes === 'number');
    // 1 minute 10 seconds ≈ 1.17 minutes
    assert.ok(result.durationMinutes > 1 && result.durationMinutes < 1.5);
  });

  it('extracts tool usage counts', () => {
    const result = parseSession(simpleContent, '/Users/test/project-a');
    assert.ok(result.toolUsage.Read, 'Should have Read tool usage');
    assert.equal(result.toolUsage.Read.calls, 1);
    assert.equal(result.toolUsage.Read.successes, 1);
    assert.equal(result.toolUsage.Read.failures, 0);
  });

  it('extracts user message count', () => {
    const result = parseSession(simpleContent, '/Users/test/project-a');
    assert.equal(result.userMessageCount, 1);
  });

  it('detects errors and retries from error session', () => {
    const result = parseSession(errorContent, '/Users/test/project-b');
    assert.ok(result.toolUsage.Bash, 'Should have Bash tool usage');
    assert.equal(result.toolUsage.Bash.calls, 2);
    assert.equal(result.toolUsage.Bash.failures, 2);
    assert.ok(result.retrySequences.length > 0, 'Should detect retry sequences');
    const bashRetry = result.retrySequences.find(r => r.tool === 'Bash');
    assert.ok(bashRetry, 'Should have a Bash retry sequence');
    assert.equal(bashRetry.count, 2);
  });

  it('detects permission denials', () => {
    const result = parseSession(errorContent, '/Users/test/project-b');
    assert.equal(result.permissionDenials, 1);
    assert.ok(result.deniedTools.includes('Write'), 'Should include Write in denied tools');
  });

  it('extracts model used', () => {
    const result = parseSession(simpleContent, '/Users/test/project-a');
    assert.equal(result.model, 'claude-sonnet-4-20250514');
  });
});

describe('aggregateSessions', () => {
  it('combines two sessions into aggregate stats', () => {
    const session1 = parseSession(simpleContent, '/Users/test/project-a');
    const session2 = parseSession(errorContent, '/Users/test/project-b');
    const agg = aggregateSessions([session1, session2]);

    assert.equal(agg.totalSessions, 2);
    assert.ok(agg.projectBreakdown['/Users/test/project-a'], 'Should have project-a breakdown');
    assert.ok(agg.projectBreakdown['/Users/test/project-b'], 'Should have project-b breakdown');
    // Combined tool usage
    assert.ok(agg.toolUsageTotal.Read, 'Should have Read in total');
    assert.ok(agg.toolUsageTotal.Bash, 'Should have Bash in total');
    assert.equal(agg.totalPermissionDenials, 1);
  });
});

describe('findRecentSessions', () => {
  it('returns files modified since a date', async () => {
    // Use fixtures dir as the search target — the .jsonl files should be recent
    const since = new Date('2020-01-01');
    const files = await findRecentSessions(fixturesDir, since);
    assert.ok(files.length >= 2, `Should find at least 2 jsonl files, found ${files.length}`);
  });

  it('returns empty for future date', async () => {
    const since = new Date('2099-01-01');
    const files = await findRecentSessions(fixturesDir, since);
    assert.equal(files.length, 0);
  });
});
