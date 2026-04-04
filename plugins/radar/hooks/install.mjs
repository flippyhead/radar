#!/usr/bin/env node

// Post-install hook: installs workflow-analyzer production dependencies.
// Runs on PluginInstall event to ensure bin/ tools are ready.

import { execSync } from "node:child_process";
import { join } from "node:path";
import { access } from "node:fs/promises";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  process.exit(0);
}

const analyzerDir = join(pluginRoot, "bin", "workflow-analyzer");

async function install() {
  try {
    // Check if node_modules already exists (skip if so)
    try {
      await access(join(analyzerDir, "node_modules"));
      return; // Already installed
    } catch {
      // Not installed yet — proceed
    }

    execSync("npm install --omit=dev", {
      cwd: analyzerDir,
      stdio: "pipe",
      timeout: 60000,
    });
  } catch (err) {
    // Non-fatal — skills will fall back to npx if bin/ isn't ready
    console.error("Radar: could not install workflow-analyzer dependencies. Skills will use npx fallback.");
  }
}

install();
