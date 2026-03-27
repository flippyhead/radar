#!/usr/bin/env node

// First-run detection for the radar plugin.
// If no catalogue file and no previous analysis output exist,
// suggest running /radar-analyze to get started.

import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkFirstRun() {
  try {
    const home = homedir();
    const catalogueExists = await fileExists(
      join(home, ".claude", "radar-catalogue.json")
    );
    const legacyCatalogueExists = await fileExists(
      join(home, ".claude", "scout-catalogue.json")
    );
    const analysisOutputExists = await fileExists(
      "/tmp/workflow-analyzer-parsed.json"
    );

    if (!catalogueExists && !legacyCatalogueExists && !analysisOutputExists) {
      console.log(
        "Welcome to Radar. Try `/radar-analyze` to analyze your recent coding sessions, or `/radar` to scan the ecosystem and get recommendations."
      );
    }
  } catch {
    // Any error — exit silently
  }
}

checkFirstRun();
