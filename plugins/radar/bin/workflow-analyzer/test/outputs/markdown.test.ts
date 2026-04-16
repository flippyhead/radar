import { describe, it, expect } from "vitest";
import { formatMarkdownReport, MarkdownOutput } from "../../src/outputs/markdown.js";
import { Insight, ReportMetadata } from "../../src/types/insight.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    module: "test",
    severity: "suggestion",
    title: "Test Insight",
    observation: "Something observed",
    action: { type: "acknowledge", message: "ok" },
    evidence: [],
    effort: "low",
    impact: "medium",
    confidence: 0.8,
    deduplicationKey: "key-1",
    ...overrides,
  };
}

const metadata: ReportMetadata = {
  period: { since: new Date("2026-03-11"), until: new Date("2026-03-18") },
  sessionCount: 42,
  sources: ["claude-code", "cowork"],
  modulesRun: ["root-cause", "direct-automation"],
};

describe("formatMarkdownReport", () => {
  it("places actions before suggestions in output", () => {
    const insights = [
      makeInsight({ title: "A suggestion", severity: "suggestion" }),
      makeInsight({ title: "An action", severity: "action" }),
    ];
    const md = formatMarkdownReport(insights, metadata);
    const actionIdx = md.indexOf("An action");
    const suggIdx = md.indexOf("A suggestion");
    expect(actionIdx).toBeLessThan(suggIdx);
  });

  it("includes session count and sources in header", () => {
    const md = formatMarkdownReport([], metadata);
    expect(md).toContain("42 sessions");
    expect(md).toContain("claude-code");
    expect(md).toContain("cowork");
  });

  it("handles string dates in period (from JSON.parse)", () => {
    const stringMetadata = {
      ...metadata,
      period: { since: "2026-03-11T00:00:00.000Z", until: "2026-03-18T00:00:00.000Z" },
    } as unknown as ReportMetadata;
    const md = formatMarkdownReport([], stringMetadata);
    expect(md).toContain("2026-03-11");
    expect(md).toContain("2026-03-18");
  });

  it("publish handles string dates in getWeekNumber (from JSON.parse)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "markdown-test-"));
    try {
      const stringMetadata = {
        ...metadata,
        period: { since: "2026-03-11T00:00:00.000Z", until: "2026-03-18T00:00:00.000Z" },
      } as unknown as ReportMetadata;
      const output = new MarkdownOutput(dir);
      // Should not throw — previously crashed calling .getFullYear() on a string
      await output.publish([], stringMetadata);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats install actions with content", () => {
    const insights = [
      makeInsight({
        severity: "action",
        title: "Install a tool",
        action: { type: "install", artifact: ".tool-versions", content: "nodejs 20.0.0" },
      }),
    ];
    const md = formatMarkdownReport(insights, metadata);
    expect(md).toContain(".tool-versions");
    expect(md).toContain("nodejs 20.0.0");
  });
});
