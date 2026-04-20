# Dismiss Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dismiss tag + reason text the user types in `/radar-review` actually influence future `/radar-recommend` scoring, so dismissing items with reasons measurably improves recommendation quality over time.

**Architecture:** (1) Migrate dismiss notes from `{at, text: "[tag] text"}` to structured `{at, tag, text}` so tags are first-class and aggregatable. (2) In `radar-recommend`, before dispatching scoring subagents, walk the catalogue for `status: "dismissed"` items (excluding the `save-for-later` tag, which is not a negative signal) and build a compact "dismissal patterns" summary grouped by tag and category. (3) Inject that summary into the shared context payload, and extend the scoring rubric with a new `negativePrior` field (0 to -2) the subagent uses to down-weight items that match dismissal patterns. (4) Main loop sums it into `total` and writes it into `scoreBreakdown` so the review UI surfaces why items scored low.

**Tech Stack:** Node.js stdlib (review server), plain HTML+JS (review client), Markdown prose (skill files). No new dependencies.

**Scope non-goals:**
- `radar-scan` behavior is unchanged. All filtering/down-weighting happens at recommend time.
- `save-for-later` tag stays in the UI but is excluded from negative-prior aggregation — it means "I want this but not now".
- No time window on dismissals in this iteration — all dismissals count. A `--dismissal-window N` arg can be added later if staleness becomes a problem.

---

## File Structure

**Modified:**
- `plugins/radar/bin/review-server/server.mjs` — accept `note` as either string (legacy) or `{tag, text}` object; always persist structured `{at, tag, text}` in `item.notes[]`.
- `plugins/radar/bin/review-server/index.html` — `confirmDismiss` posts `{status: "dismissed", note: {tag, text}}`; note rendering handles both structured notes and legacy `[tag] text` strings.
- `plugins/radar/skills/radar-recommend/SKILL.md` — add Step 2.5 ("Build dismissal-pattern summary"), extend subagent rubric with `negativePrior`, update main-loop `total` computation and `scoreBreakdown` schema.
- `plugins/radar/.claude-plugin/plugin.json` — version 4.2.0 → 4.3.0 (via bump-version.sh).
- `.claude-plugin/marketplace.json` — radar entry version 4.3.0 (via bump-version.sh).
- `.claude-plugin/plugin.json` — root version 4.3.0 (via bump-version.sh).
- `README.md` — tighten one sentence: the "grows smarter over time as Radar learns what you care about" claim finally becomes literally true.

**Created:**
- `plugins/radar/bin/review-server/test.mjs` — stdlib Node integration test that boots the server against a temp catalogue, exercises PATCH with both note shapes, and asserts the persisted shape.

---

## Task 1: Pin baseline — integration test for current server behavior

**Why first:** establish a runnable test harness before changing server semantics. This task creates the test file and verifies today's behavior (legacy string-note path) is captured. Structured-note test is added in Task 2 as the failing test that drives the implementation.

**Files:**
- Create: `plugins/radar/bin/review-server/test.mjs`

- [ ] **Step 1: Create the test file**

```javascript
// plugins/radar/bin/review-server/test.mjs
// Stdlib-only integration test for the review server.
// Boots the server against a temp catalogue and exercises PATCH / GET.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

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
    proc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      const m = s.match(/RADAR_REVIEW_URL (http:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
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
  const dir = mkdtempSync(join(tmpdir(), 'radar-review-test-'));
  const catPath = join(dir, 'catalogue.json');
  writeFileSync(catPath, JSON.stringify(makeCatalogue()));

  const env = { ...process.env, RADAR_CATALOGUE: catPath, RADAR_PORT: '0' };
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
    assert.equal(typeof item1.notes[0].text, 'string');
    console.log('OK: legacy string note accepted and stored');

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
```

- [ ] **Step 2: Make the server honor `RADAR_CATALOGUE` env var**

Currently the server hardcodes `~/.claude/radar/catalogue.json`. The test needs to point it at a temp file. Make this minimal change now (one line) — it's infrastructure for the rest of the plan.

Edit `plugins/radar/bin/review-server/server.mjs:13`:

```javascript
// Before:
const CATALOGUE = join(homedir(), ".claude/radar/catalogue.json");
// After:
const CATALOGUE = process.env.RADAR_CATALOGUE
  || join(homedir(), ".claude/radar/catalogue.json");
```

- [ ] **Step 3: Run the test and verify it passes**

```bash
node plugins/radar/bin/review-server/test.mjs
```

Expected output: `OK: legacy string note accepted and stored` then `PASS`. Exit code 0.

- [ ] **Step 4: Commit**

```bash
git add plugins/radar/bin/review-server/test.mjs plugins/radar/bin/review-server/server.mjs
git commit -m "test(review-server): add baseline integration test + RADAR_CATALOGUE env override"
```

---

## Task 2: Add structured-note support (RED → GREEN)

**Files:**
- Modify: `plugins/radar/bin/review-server/test.mjs`
- Modify: `plugins/radar/bin/review-server/server.mjs`

- [ ] **Step 1: Add failing test for structured-note shape**

Append to the `run()` function in `plugins/radar/bin/review-server/test.mjs`, right before `console.log('PASS')`:

```javascript
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
```

- [ ] **Step 2: Run tests — confirm structured-note tests fail**

```bash
node plugins/radar/bin/review-server/test.mjs
```

Expected: first test (`OK: legacy string note accepted and stored`) passes, second test fails with `AssertionError` on `item2.notes[0].tag === 'already-installed'` (server is currently dropping the object shape or coercing it to a string).

- [ ] **Step 3: Update server to handle structured note shape**

Replace the note-handling block in `plugins/radar/bin/review-server/server.mjs` (lines 102–106 in the current file):

```javascript
// Before:
if (patch.note && typeof patch.note === "string" && patch.note.trim()) {
  item.notes = item.notes || [];
  item.notes.push({ at: now, text: patch.note.trim() });
  session.notesAdded++;
}

// After:
if (patch.note !== undefined && patch.note !== null) {
  item.notes = item.notes || [];
  let entry = null;
  if (typeof patch.note === "string" && patch.note.trim()) {
    // Legacy path: "[tag] text" — parse tag back out if present, else store tag-less.
    const trimmed = patch.note.trim();
    const m = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    entry = m
      ? { at: now, tag: m[1], text: m[2] }
      : { at: now, tag: null, text: trimmed };
  } else if (typeof patch.note === "object" && typeof patch.note.tag === "string") {
    entry = {
      at: now,
      tag: patch.note.tag,
      text: typeof patch.note.text === "string" ? patch.note.text : "",
    };
  }
  if (entry) {
    item.notes.push(entry);
    session.notesAdded++;
  }
}
```

- [ ] **Step 4: Run tests — confirm all three pass**

```bash
node plugins/radar/bin/review-server/test.mjs
```

Expected output ends with `PASS` and exit code 0. All three `OK:` lines print.

- [ ] **Step 5: Commit**

```bash
git add plugins/radar/bin/review-server/server.mjs plugins/radar/bin/review-server/test.mjs
git commit -m "feat(review-server): accept structured {tag, text} dismiss notes"
```

---

## Task 3: Update review-UI client to send structured notes

**Files:**
- Modify: `plugins/radar/bin/review-server/index.html`

- [ ] **Step 1: Change `confirmDismiss` to post structured note**

Find the `confirmDismiss` function in `plugins/radar/bin/review-server/index.html` (around line 504):

```javascript
// Before:
async function confirmDismiss(id) {
  const sel = state.dismissSelections[id] || {};
  if (!sel.tag) return;
  const body = { status: 'dismissed' };
  const noteText = `[${sel.tag}] ${sel.text||''}`.trim();
  if (noteText) body.note = noteText;
  await patchItem(id, body);
  delete state.dismissSelections[id];
  state.dismissOpen.delete(id);
  render();
}

// After:
async function confirmDismiss(id) {
  const sel = state.dismissSelections[id] || {};
  if (!sel.tag) return;
  await patchItem(id, {
    status: 'dismissed',
    note: { tag: sel.tag, text: (sel.text || '').trim() },
  });
  delete state.dismissSelections[id];
  state.dismissOpen.delete(id);
  render();
}
```

- [ ] **Step 2: Update note rendering to handle both shapes**

Find the notes-rendering block (around line 408–413):

```javascript
// Before:
const notes = (item.notes && item.notes.length) ? `
  <details class="accordion">
    <summary>${item.notes.length} note${item.notes.length===1?'':'s'}</summary>
    <div class="notes">
      ${item.notes.map(n => `<div class="note-item"><span class="note-date">${relDate(n.at)}</span>${escapeHtml(n.text)}</div>`).join('')}
    </div>
  </details>` : '';

// After:
const notes = (item.notes && item.notes.length) ? `
  <details class="accordion">
    <summary>${item.notes.length} note${item.notes.length===1?'':'s'}</summary>
    <div class="notes">
      ${item.notes.map(n => {
        const tagChip = n.tag
          ? `<span class="note-tag">${escapeHtml(n.tag)}</span>`
          : '';
        const bodyText = n.text || '';
        return `<div class="note-item"><span class="note-date">${relDate(n.at)}</span>${tagChip}${escapeHtml(bodyText)}</div>`;
      }).join('')}
    </div>
  </details>` : '';
```

- [ ] **Step 3: Add minimal CSS for `.note-tag`**

Find the `.note-date` rule (around line 167) and add `.note-tag` right after it:

```css
.note-date { font-size: 11px; color: var(--muted); margin-right: 8px; }
.note-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  margin-right: 6px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 10px;
}
```

- [ ] **Step 4: Manual smoke test**

```bash
RADAR_CATALOGUE=/tmp/smoke-catalogue.json node plugins/radar/bin/review-server/server.mjs
```

In a separate shell, seed the temp catalogue with one item, then open the printed URL in a browser. Click Dismiss on the item, pick the `Already knew` tag, type "testing structured shape", click Dismiss. In a third shell:

```bash
node -e "console.log(JSON.stringify(require('/tmp/smoke-catalogue.json').items[0].notes, null, 2))"
```

Expected:

```json
[ { "at": "...", "tag": "already-knew", "text": "testing structured shape" } ]
```

Stop the server (`POST /api/exit` or Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add plugins/radar/bin/review-server/index.html
git commit -m "feat(review-ui): send structured {tag, text} notes on dismiss"
```

---

## Task 4: Aggregate dismissal patterns in radar-recommend

**Files:**
- Modify: `plugins/radar/skills/radar-recommend/SKILL.md`

This task is prose-only (SKILL.md is executed by the LLM at runtime). Validation is by inspection + a smoke run in Task 5.

- [ ] **Step 1: Add "Step 2.5" after the current Step 2**

Insert after Step 2's final subheading ("User instructions (lightweight)") in `plugins/radar/skills/radar-recommend/SKILL.md`. Add this new section verbatim:

````markdown
### Step 2.5: Build Dismissal-Pattern Summary

Walk the full catalogue (not just the Step 1 filtered set) and collect every item where `status === "dismissed"` that has at least one note with a `tag` field.

**Exclude the `save-for-later` tag.** It means "I want this but not now" — it is not a negative signal and must not feed into the negative prior. Treat `null` / missing tags as excluded too.

From the remaining dismissed items, build a compact summary (aim for under 400 characters, hard cap 800):

1. **Counts by tag** — `{ "not-relevant": 7, "already-installed": 3, "already-knew": 2, "wrong-score": 1 }`. Drop entries with count 0.
2. **Top 3 (category, tag) pairs by count** — e.g., `tooling × not-relevant (4)`, `mcp × already-installed (2)`. These are the strongest patterns.
3. **Up to 5 representative reason snippets** — take the most recent non-empty `text` fields, truncate each to 60 chars. Format: `"[tag] text..."`. These give the scoring subagent concrete phrases to match against.

If there are fewer than 3 dismissed items total, skip this step — there's not enough signal yet. Just note in the assembled context payload: `dismissalPatterns: (none yet — fewer than 3 dismissals with tags)`.

Append the summary to the **context payload** built in Step 3 under a new `dismissalPatterns:` key. Keep the rest of the payload structure unchanged so caching still works.
````

- [ ] **Step 2: Extend the subagent prompt template with `negativePrior`**

In the same file, find the rubric block inside the "Subagent prompt template" (currently ends with the `effort` bullet, around lines 107–110). Add a new rubric bullet immediately after `effort`:

```markdown
> - `negativePrior` (-2 to 0):
>   - -2: strong match to dismissal patterns — same category AND a tag or description phrase that directly echoes a dismissed reason (e.g., user dismissed 4 `tooling × not-relevant` items and this is another tooling item the user will likely dismiss)
>   - -1: moderate match — same category as a frequently-dismissed combo, OR tags/description overlap with a recent dismissed reason
>   - 0: no notable overlap with dismissal patterns
```

Also update the JSON-keys line at the top of the template:

```markdown
# Before:
> You are scoring one catalogue item against a user's context. Return a single JSON object with keys `goalAlignment`, `usageGap`, `recency`, `effort`, `observation`, `recommendation`. No prose around the JSON.

# After:
> You are scoring one catalogue item against a user's context. Return a single JSON object with keys `goalAlignment`, `usageGap`, `recency`, `effort`, `negativePrior`, `observation`, `recommendation`. No prose around the JSON.
```

And add one line to the `User context:` description so the subagent knows to use `dismissalPatterns`:

```markdown
# Before (in the template):
> **User context:**
> ```
> <context payload: stated goals, active projects, top tools from session history, installed MCP servers/plugins, recurring prompt themes>
> ```

# After:
> **User context:**
> ```
> <context payload: stated goals, active projects, top tools from session history, installed MCP servers/plugins, recurring prompt themes, dismissalPatterns (counts by tag, top category×tag pairs, recent reason snippets)>
> ```
```

- [ ] **Step 3: Update main-loop total computation and breakdown schema**

Find the "Once all subagents return" paragraph (currently just after the rubric block). Replace with:

```markdown
**Once all subagents return,** the main loop computes `total = goalAlignment + usageGap + recency + effort + negativePrior`. Because `negativePrior` ranges from -2 to 0, `total` can be as low as -2 and as high as 10. If `lastRecommended` is within the last 14 days, subtract an additional 2 from `total` (freshness penalty — do this in the main loop, not in the subagent). Skip items whose final `total < 3`.

**Malformed `negativePrior`:** if the subagent omits `negativePrior` or returns a positive number, treat it as 0 (neutral) and log a one-line warning. Do NOT fall back to main-loop scoring just for this — the other rubric values are still usable.
```

Also update the Step 6 breakdown schema. Find:

```markdown
- `scoreBreakdown`: `{ "goalAlignment": N, "usageGap": N, "recency": N, "effort": N }`
```

Replace with:

```markdown
- `scoreBreakdown`: `{ "goalAlignment": N, "usageGap": N, "recency": N, "effort": N, "negativePrior": N }` (where `negativePrior` is 0, -1, or -2)
```

- [ ] **Step 4: Update Step 5 insight evidence string**

In Step 5, the insight evidence string currently reads:

```json
"evidence": ["score breakdown: goal=N, gap=N, recency=N, effort=N, total=N"],
```

Change to:

```json
"evidence": ["score breakdown: goal=N, gap=N, recency=N, effort=N, negPrior=N, total=N"],
```

This makes the penalty visible to anyone reading an insight later and is what the review UI surfaces as the "why it scored this way" line.

- [ ] **Step 5: Manual verification by reading**

Re-read the full SKILL.md top to bottom. Confirm:
- Step 2.5 exists between Step 2 and Step 3
- Rubric has 5 integer fields in the stated order (goalAlignment, usageGap, recency, effort, negativePrior)
- "Once all subagents return" paragraph sums all 5
- `scoreBreakdown` schema in Step 6 includes `negativePrior`
- Insight evidence in Step 5 includes `negPrior=N`
- Nothing else was broken

- [ ] **Step 6: Commit**

```bash
git add plugins/radar/skills/radar-recommend/SKILL.md
git commit -m "feat(radar-recommend): feed dismissal patterns into scoring via negativePrior"
```

---

## Task 5: End-to-end smoke test

**Files:** none (this task is a manual validation run against the real catalogue).

- [ ] **Step 1: Seed a dismissal with the new structured shape**

Pick a low-value item in your live catalogue (e.g., the Notch-Pilot one from earlier). Start the review server:

```bash
node plugins/radar/bin/review-server/server.mjs
```

In the UI, dismiss 3 different items with deliberate tag + reason combinations:
1. A `tooling`-category item → tag `not-relevant`, text "ambient UI doesn't fit my flow"
2. Another `tooling` item → tag `not-relevant`, text "I don't want more dashboards"
3. A `general-ai` item → tag `already-knew`, text "saw this in the announcement"

Close the server.

- [ ] **Step 2: Confirm persisted shape**

```bash
node -e "
const c = require('/Users/peterbrown/.claude/radar/catalogue.json');
for (const i of c.items.filter(x => x.status === 'dismissed')) {
  console.log(i.category, '|', i.title.slice(0,50));
  for (const n of (i.notes||[])) console.log('   tag=', n.tag, '| text=', n.text);
}
"
```

Expected: three dismissed items, each note has a distinct `tag` field (not `null`) and the text you typed.

- [ ] **Step 3: Run /radar-recommend and watch the context payload**

Invoke `/radar-recommend` from Claude Code. Before the subagents dispatch, the session model will have assembled the context payload. Ask Claude to print that payload verbatim before proceeding — it should contain a `dismissalPatterns` block with:

- a `counts by tag` object showing at least `not-relevant: 2, already-knew: 1`
- a `top (category, tag) pairs` list with `tooling × not-relevant (2)` at the top
- 3 recent reason snippets

- [ ] **Step 4: Verify negative prior is applied to a relevant item**

Add one new `tooling`-category item to the catalogue manually (or wait for the next scan). Run `/radar-recommend` again. Inspect its `scoreBreakdown` in `~/.claude/radar/catalogue.json` — it should have `negativePrior: -1` or `-2` given the `tooling × not-relevant` pattern.

An unrelated category (e.g., `api`) should have `negativePrior: 0`.

- [ ] **Step 5: Revert the smoke-test mutations (optional)**

If you don't actually want those three items dismissed, flip them back to `status: "new"` and empty `notes` via the review UI or a quick node snippet.

- [ ] **Step 6: Commit any cleanup (if needed)**

No commit needed if all changes were catalogue-only (catalogue.json is gitignored and lives in `~/.claude/radar/`). Skip this step.

---

## Task 6: Tighten README claim about learning

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "Manage your catalogue" paragraph**

Find this line in `README.md`:

```markdown
Run `/radar-review` to browse discoveries and insights in a local web UI. Star things worth pursuing, dismiss noise, add notes, filter by status, tier, or source. Your catalogue grows smarter over time as Radar learns what you care about.
```

Replace with:

```markdown
Run `/radar-review` to browse discoveries and insights in a local web UI. Star things worth pursuing, dismiss noise, add notes, filter by status, tier, or source. When you dismiss an item, pick a reason tag — Radar reads those tags on the next `/radar-recommend` and down-weights items that match your dismissal patterns.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: explain how dismiss feedback improves future recommendations"
```

---

## Task 7: Bump version and verify

**Files:**
- Modify (via script): `plugins/radar/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Run the bump script**

```bash
./scripts/bump-version.sh radar 4.3.0
```

Expected output:
```
Updated .../plugins/radar/.claude-plugin/plugin.json → 4.3.0
Updated .../.claude-plugin/marketplace.json (radar) → 4.3.0
Updated .../.claude-plugin/plugin.json → 4.3.0
Done. Run 'git diff' to verify.
```

- [ ] **Step 2: Verify all three files updated**

```bash
git diff --stat
```

Expected: three `plugin.json` / `marketplace.json` files each with `-"version": "4.2.0"` / `+"version": "4.3.0"`.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json plugins/radar/.claude-plugin/plugin.json
git commit -m "chore: bump radar to 4.3.0 — dismiss feedback loop"
```

---

## Self-review checklist

Before handing off:

- **Spec coverage:**
  - Structured note shape on both client and server — Tasks 2, 3
  - Dismissal-pattern aggregation — Task 4 Step 1
  - `negativePrior` rubric + main-loop sum — Task 4 Steps 2, 3
  - `save-for-later` excluded — Task 4 Step 1 explicit
  - `scoreBreakdown` surfaces the penalty — Task 4 Step 3
  - E2E smoke — Task 5
  - Version bump — Task 7

- **Placeholder scan:** no TBD / "similar to earlier" / "add error handling" / "write tests for the above" — every task has concrete code or explicit verification commands.

- **Type consistency:**
  - Note shape: `{at, tag, text}` in server, client, and legacy-parse branch
  - Rubric key: `negativePrior` (camelCase, consistent across SKILL.md changes and README mention)
  - `scoreBreakdown` includes `negativePrior` in SKILL.md Step 6 and in the insight evidence string in Step 5
