#!/usr/bin/env node
// Radar review server — tiny local HTTP server for browsing the catalogue.
// Stdlib only (node:http, node:fs). No runtime dependencies.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOGUE = join(homedir(), ".claude/radar/catalogue.json");

function loadCatalogue() {
  if (!existsSync(CATALOGUE)) {
    mkdirSync(dirname(CATALOGUE), { recursive: true });
    return { version: "1.0", updatedAt: null, items: [], insights: [] };
  }
  return JSON.parse(readFileSync(CATALOGUE, "utf8"));
}

function saveCatalogue(cat) {
  cat.updatedAt = new Date().toISOString();
  writeFileSync(CATALOGUE, JSON.stringify(cat, null, 2));
}

// Session summary — mutations since server started
const session = {
  starred: 0,
  dismissed: 0,
  reviewed: 0,
  actedOn: 0,
  notesAdded: 0,
  startedAt: new Date().toISOString(),
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // Static index
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(join(__dirname, "index.html")));
      return;
    }

    // Catalogue read
    if (req.method === "GET" && url.pathname === "/api/catalogue") {
      return json(res, 200, loadCatalogue());
    }

    // Item mutation
    if (req.method === "PATCH" && url.pathname.startsWith("/api/items/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/items/".length));
      const patch = await readBody(req);
      const cat = loadCatalogue();
      const item = cat.items.find((i) => i.id === id);
      if (!item) return json(res, 404, { error: "not found" });

      const now = new Date().toISOString();
      const ALLOWED_STATUSES = new Set([
        "new", "starred", "reviewed", "dismissed", "acted-on",
      ]);

      if (patch.status !== undefined) {
        if (!ALLOWED_STATUSES.has(patch.status)) {
          return json(res, 400, { error: `invalid status: ${patch.status}` });
        }
        if (patch.status !== item.status) {
          item.status = patch.status;
          // Per schema, `new` items have reviewedAt: null
          item.reviewedAt = patch.status === "new" ? null : now;
          if (patch.status === "starred") session.starred++;
          else if (patch.status === "dismissed") session.dismissed++;
          else if (patch.status === "reviewed") session.reviewed++;
          else if (patch.status === "acted-on") session.actedOn++;
        }
      }

      if (patch.note !== undefined && patch.note !== null) {
        item.notes = item.notes || [];
        let entry = null;
        if (typeof patch.note === "string" && patch.note.trim()) {
          // Legacy path: "[tag] text" — parse tag back out if present, else store tag-less.
          const trimmed = patch.note.trim();
          const m = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
          entry = m
            ? { at: now, tag: m[1].trim(), text: m[2].trimEnd() }
            : { at: now, tag: null, text: trimmed };
        } else if (typeof patch.note === "object" && patch.note !== null) {
          const rawTag = typeof patch.note.tag === "string" ? patch.note.tag.trim() : "";
          // trimEnd matches the legacy regex path so identical content stores identically.
          const rawText = typeof patch.note.text === "string" ? patch.note.text.trimEnd() : "";
          if (rawTag || rawText.trim()) {
            entry = {
              at: now,
              tag: rawTag || null,
              text: rawText,
            };
          }
        }
        if (entry) {
          item.notes.push(entry);
          session.notesAdded++;
        }
      }

      saveCatalogue(cat);
      return json(res, 200, item);
    }

    // Exit
    if (req.method === "POST" && url.pathname === "/api/exit") {
      json(res, 200, { bye: true });
      setTimeout(() => {
        process.stdout.write(
          "RADAR_SESSION_SUMMARY " + JSON.stringify(session) + "\n"
        );
        process.exit(0);
      }, 100);
      return;
    }

    // 404
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    json(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

const port = Number(process.env.RADAR_PORT || 0);
server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const resolved = `http://127.0.0.1:${addr.port}`;
  process.stdout.write("RADAR_REVIEW_URL " + resolved + "\n");

  // Best-effort open (macOS `open`, Linux `xdg-open`, Windows `start`)
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  const args = process.platform === "win32" ? ["", resolved] : [resolved];
  try {
    spawn(opener, args, {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    }).unref();
  } catch {
    // If opening fails, user can click the URL manually
  }
});

// Graceful shutdown on SIGINT/SIGTERM
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    process.stdout.write(
      "RADAR_SESSION_SUMMARY " + JSON.stringify(session) + "\n"
    );
    process.exit(0);
  });
}
