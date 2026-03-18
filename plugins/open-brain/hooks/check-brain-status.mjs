#!/usr/bin/env node

// Check if the user's Open Brain has any thoughts.
// If empty, suggest running /brain-init.
// Exits silently if brain has content or is unreachable.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_BRAIN_URL = "https://ai-brain-pi.vercel.app/api/mcp";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const CLIENT_INFO = { name: "open-brain-session-hook", version: "1.0.0" };

async function getBrainUrl() {
  try {
    const hookDir = dirname(fileURLToPath(import.meta.url));
    const configPath = join(hookDir, "..", ".mcp.json");
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    return config?.mcpServers?.["ai-brain"]?.url || DEFAULT_BRAIN_URL;
  } catch {
    return DEFAULT_BRAIN_URL;
  }
}

function getAuthHeader() {
  const explicitAuth =
    process.env.OPEN_BRAIN_AUTHORIZATION ?? process.env.MCP_AUTHORIZATION;
  if (explicitAuth) {
    return explicitAuth;
  }

  const token =
    process.env.OPEN_BRAIN_TOKEN ??
    process.env.OPEN_BRAIN_API_KEY ??
    process.env.MCP_AUTH_TOKEN;
  return token ? `Bearer ${token}` : undefined;
}

function buildHeaders(sessionId) {
  const headers = { "Content-Type": "application/json" };
  const authorization = getAuthHeader();
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  return headers;
}

async function checkBrainStatus() {
  try {
    const brainUrl = await getBrainUrl();
    const initResponse = await fetch(brainUrl, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!initResponse.ok) {
      // Brain unreachable or auth required — exit silently
      process.exit(0);
    }

    const sessionId = initResponse.headers.get("mcp-session-id");
    await initResponse.json().catch(() => null);

    await fetch(brainUrl, {
      method: "POST",
      headers: buildHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);

    const response = await fetch(brainUrl, {
      method: "POST",
      headers: buildHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_stats",
          arguments: {},
        },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      // Brain unreachable or auth required — exit silently
      process.exit(0);
    }

    const data = await response.json();
    const result = data?.result;

    // Parse the stats to check thought count
    if (result && typeof result === "object") {
      const content = result.content?.[0]?.text;
      if (content) {
        const stats = JSON.parse(content);
        if (stats.totalThoughts === 0) {
          console.log(
            "Your Open Brain is empty. Run `/brain-init` to automatically set up your knowledge base from your connected tools and AI memory."
          );
        }
      }
    }
  } catch {
    // Any error (network, parse, timeout) — exit silently
  }
}

checkBrainStatus();
