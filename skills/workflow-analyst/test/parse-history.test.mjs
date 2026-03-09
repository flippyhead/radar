import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory } from '../parse-history.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, 'fixtures', 'history.jsonl'), 'utf-8');

describe('parseHistory', () => {
  it('finds frequently typed prompts', () => {
    const result = parseHistory(fixture);
    const topPrompt = result.frequentPrompts[0];
    assert.equal(topPrompt.prompt, 'Run the tests');
    assert.equal(topPrompt.count, 3);
  });

  it('identifies slash commands separately', () => {
    const result = parseHistory(fixture);
    const commitCmd = result.frequentPrompts.find(p => p.prompt === '/commit');
    assert.ok(commitCmd);
    assert.equal(commitCmd.count, 2);
  });

  it('calculates project activity from history', () => {
    const result = parseHistory(fixture);
    assert.equal(result.projectActivity['/Users/test/project-a'], 4);
    assert.equal(result.projectActivity['/Users/test/project-b'], 2);
  });
});
