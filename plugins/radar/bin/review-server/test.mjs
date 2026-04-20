// plugins/radar/bin/review-server/test.mjs
// Stdlib-only integration test for the review server.
// Boots the server against a temp catalogue and exercises PATCH / GET.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, 'server.mjs');

function makeCatalogue() {
  return {
    version: '1.0',
    updatedAt: null,
    items: [
      {
        id: 'test-item-1',
        title: 'Test item',
        url: 'https://example.test/1',
        description: 'seed',
        category: 'tooling',
        tags: ['t1'],
        source: 'manual',
        discoveredAt: '2026-04-01T00:00:00.000Z',
        status: 'new',
        notes: [],
        score: null,
        scoreBreakdown: null,
        reviewedAt: null,
        lastRecommended: null,
      },
    ],
    insights: [],
  };
}

async function waitForUrl(proc) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server boot timeout')), 5000);
    let buf = '';
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/RADAR_REVIEW_URL (http:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (code) => {
      clearTimeout(t);
      reject(new Error(`server exited with code ${code} before printing URL`));
    });
  });
}

async function patch(url, id, body) {
  const res = await fetch(`${url}/api/items/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function run() {
  // Point the server at a temp catalogue by overriding HOME so its
  // homedir()-based fixed path resolves into the temp dir. This keeps the
  // "catalogue lives at ~/.claude/radar/catalogue.json" invariant intact.
  const dir = mkdtempSync(join(tmpdir(), 'radar-review-test-'));
  const catDir = join(dir, '.claude', 'radar');
  const catPath = join(catDir, 'catalogue.json');
  mkdirSync(catDir, { recursive: true });
  writeFileSync(catPath, JSON.stringify(makeCatalogue()));

  const env = { ...process.env, HOME: dir, RADAR_PORT: '0' };
  const proc = spawn('node', [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await waitForUrl(proc);

    // TEST 1: legacy string-note path still works
    const r1 = await patch(url, 'test-item-1', {
      status: 'dismissed',
      note: '[not-relevant] legacy string note',
    });
    assert.equal(r1.status, 200, 'PATCH returns 200');
    const cat1 = JSON.parse(readFileSync(catPath, 'utf8'));
    const item1 = cat1.items.find((i) => i.id === 'test-item-1');
    assert.equal(item1.status, 'dismissed');
    assert.equal(item1.notes.length, 1);
    assert.equal(item1.notes[0].tag, 'not-relevant');
    assert.equal(item1.notes[0].text, 'legacy string note');
    assert.equal(typeof item1.notes[0].at, 'string');
    console.log('OK: legacy string note accepted and stored');

    // Reset the item so the next test is clean
    const cat = JSON.parse(readFileSync(catPath, 'utf8'));
    const it = cat.items.find((i) => i.id === 'test-item-1');
    it.status = 'new'; it.notes = []; it.reviewedAt = null;
    writeFileSync(catPath, JSON.stringify(cat));

    // TEST 2: structured {tag, text} note is accepted and persisted as {at, tag, text}
    const r2 = await patch(url, 'test-item-1', {
      status: 'dismissed',
      note: { tag: 'already-installed', text: 'already have it' },
    });
    assert.equal(r2.status, 200, 'structured PATCH returns 200');
    const cat2 = JSON.parse(readFileSync(catPath, 'utf8'));
    const item2 = cat2.items.find((i) => i.id === 'test-item-1');
    assert.equal(item2.status, 'dismissed');
    assert.equal(item2.notes.length, 1, 'one note stored');
    assert.equal(item2.notes[0].tag, 'already-installed', 'tag persisted as field');
    assert.equal(item2.notes[0].text, 'already have it', 'text persisted separately');
    assert.ok(item2.notes[0].at, 'at timestamp present');
    console.log('OK: structured note accepted and stored as {at, tag, text}');

    // TEST 3: structured note with empty text still stores the tag
    it.status = 'new'; it.notes = []; it.reviewedAt = null;
    writeFileSync(catPath, JSON.stringify(cat));
    const r3 = await patch(url, 'test-item-1', {
      status: 'dismissed',
      note: { tag: 'not-relevant', text: '' },
    });
    assert.equal(r3.status, 200);
    const cat3 = JSON.parse(readFileSync(catPath, 'utf8'));
    const item3 = cat3.items.find((i) => i.id === 'test-item-1');
    assert.equal(item3.notes.length, 1, 'tag-only note still stored');
    assert.equal(item3.notes[0].tag, 'not-relevant');
    assert.equal(item3.notes[0].text, '');
    console.log('OK: tag-only structured note stored');

    // TEST 4: empty-tag structured note preserves the text as a tag-less note
    it.status = 'new'; it.notes = []; it.reviewedAt = null;
    writeFileSync(catPath, JSON.stringify(cat));
    const r4 = await patch(url, 'test-item-1', {
      status: 'dismissed',
      note: { tag: '', text: 'text without a tag' },
    });
    assert.equal(r4.status, 200);
    const cat4 = JSON.parse(readFileSync(catPath, 'utf8'));
    const item4 = cat4.items.find((i) => i.id === 'test-item-1');
    assert.equal(item4.notes.length, 1, 'empty-tag note still stored');
    assert.equal(item4.notes[0].tag, null, 'tag normalized to null');
    assert.equal(item4.notes[0].text, 'text without a tag', 'text preserved verbatim');
    console.log('OK: empty-tag structured note stored as tag-less');

    // TEST 5: fully blank structured note is dropped (no empty entry)
    it.status = 'new'; it.notes = []; it.reviewedAt = null;
    writeFileSync(catPath, JSON.stringify(cat));
    const r5 = await patch(url, 'test-item-1', {
      status: 'dismissed',
      note: { tag: '', text: '' },
    });
    assert.equal(r5.status, 200);
    const cat5 = JSON.parse(readFileSync(catPath, 'utf8'));
    const item5 = cat5.items.find((i) => i.id === 'test-item-1');
    assert.equal(item5.status, 'dismissed', 'status still updates even when note dropped');
    assert.equal(item5.notes.length, 0, 'fully blank note not stored');
    console.log('OK: fully blank structured note dropped cleanly');

    // TEST 6: whitespace-only text with empty tag is dropped (junk note guard)
    it.status = 'new'; it.notes = []; it.reviewedAt = null;
    writeFileSync(catPath, JSON.stringify(cat));
    const r6 = await patch(url, 'test-item-1', {
      status: 'dismissed',
      note: { tag: '', text: '   ' },
    });
    assert.equal(r6.status, 200);
    const cat6 = JSON.parse(readFileSync(catPath, 'utf8'));
    const item6 = cat6.items.find((i) => i.id === 'test-item-1');
    assert.equal(item6.notes.length, 0, 'whitespace-only note not stored');
    console.log('OK: whitespace-only structured note dropped');

    console.log('PASS');
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
