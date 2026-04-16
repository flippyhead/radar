import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const SEVERITY_ORDER = { alert: 0, action: 1, suggestion: 2, info: 3 };
const SECTION_LABELS = {
    alert: "Alerts",
    action: "Actions to Take",
    suggestion: "Suggestions",
    info: "Notes & Trends",
};
function formatAction(action) {
    switch (action.type) {
        case "install":
            return `**Install** \`${action.artifact}\`\n\`\`\`\n${action.content}\n\`\`\``;
        case "run":
            return `**Run:** \`${action.command}\`\n${action.explanation}`;
        case "save":
            return `**Save to** \`${action.destination}\`\n\`\`\`\n${action.content}\n\`\`\``;
        case "review":
            return `**Review:** ${action.summary}\n${action.links.map((l) => `- ${l}`).join("\n")}`;
        case "decide":
            return `**Decision needed:** ${action.question}\n${action.options.map((o) => `- ${o}`).join("\n")}`;
        case "acknowledge":
            return action.message;
    }
}
function formatInsight(insight) {
    const lines = [];
    lines.push(`### ${insight.title}`);
    lines.push("");
    lines.push(insight.observation);
    if (insight.diagnosis) {
        lines.push("");
        lines.push(`> ${insight.diagnosis}`);
    }
    lines.push("");
    lines.push(formatAction(insight.action));
    if (insight.evidence.length > 0) {
        lines.push("");
        lines.push("**Evidence:**");
        for (const e of insight.evidence) {
            if (e.metric)
                lines.push(`- ${e.metric}`);
            if (e.snippet)
                lines.push(`- \`${e.snippet}\``);
            if (e.sessions?.length)
                lines.push(`- Sessions: ${e.sessions.join(", ")}`);
        }
    }
    lines.push(`\n*Impact: ${insight.impact} | Effort: ${insight.effort} | Confidence: ${Math.round(insight.confidence * 100)}%*`);
    return lines.join("\n");
}
export function formatMarkdownReport(insights, metadata) {
    const lines = [];
    // Header
    const since = (typeof metadata.period.since === "string" ? metadata.period.since : metadata.period.since.toISOString()).split("T")[0];
    const until = (typeof metadata.period.until === "string" ? metadata.period.until : metadata.period.until.toISOString()).split("T")[0];
    lines.push(`# Workflow Analysis Report`);
    lines.push("");
    lines.push(`**Period:** ${since} to ${until}`);
    lines.push(`**${metadata.sessionCount} sessions** across ${metadata.sources.join(", ")}`);
    lines.push(`**Modules:** ${metadata.modulesRun.join(", ")}`);
    lines.push("");
    lines.push("---");
    // Group by severity in order
    const grouped = new Map();
    for (const insight of insights) {
        const group = grouped.get(insight.severity) ?? [];
        group.push(insight);
        grouped.set(insight.severity, group);
    }
    const severities = [...grouped.keys()].sort((a, b) => (SEVERITY_ORDER[a] ?? 99) - (SEVERITY_ORDER[b] ?? 99));
    for (const severity of severities) {
        const group = grouped.get(severity);
        lines.push("");
        lines.push(`## ${SECTION_LABELS[severity] ?? severity}`);
        lines.push("");
        for (const insight of group) {
            lines.push(formatInsight(insight));
            lines.push("");
        }
    }
    if (insights.length === 0) {
        lines.push("");
        lines.push("No actionable insights this period. Keep up the good work!");
    }
    return lines.join("\n");
}
function getWeekNumber(date) {
    const d = typeof date === "string" ? new Date(date) : date;
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d.getTime() - start.getTime();
    const week = Math.ceil((diff / (7 * 24 * 60 * 60 * 1000) + start.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
export class MarkdownOutput {
    name = "markdown";
    outputDir;
    constructor(outputDir) {
        this.outputDir = outputDir;
    }
    async publish(insights, metadata) {
        const report = formatMarkdownReport(insights, metadata);
        const weekNum = getWeekNumber(metadata.period.until);
        const filename = `report-${weekNum}.md`;
        mkdirSync(this.outputDir, { recursive: true });
        writeFileSync(join(this.outputDir, filename), report, "utf-8");
    }
}
//# sourceMappingURL=markdown.js.map