#!/usr/bin/env node

// Check if the user's Open Brain has any thoughts.
// If empty, suggest running /brain-init.
// Exits silently if brain has content or is unreachable.

const BRAIN_URL = "https://ai-brain-pi.vercel.app/api/mcp";

async function checkBrainStatus() {
  try {
    const response = await fetch(BRAIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
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
