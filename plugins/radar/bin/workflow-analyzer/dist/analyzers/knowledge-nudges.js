const MIN_SESSIONS_FOR_REPETITION = 2;
export class KnowledgeNudgesAnalyzer {
    name = "knowledge-nudges";
    description = "Detects repeated questions and knowledge that should be saved";
    dataRequirements = {
        needsMessages: true,
        needsToolCalls: false,
        needsErrors: false,
        needsSessionGroups: true,
        needsHistory: true,
        needsExternalContext: false,
        lookbackDays: 14, // look back further for repetition detection
    };
    async analyze(input) {
        // Extract user prompts across all sessions
        const sessionPrompts = [];
        for (const session of input.sessions) {
            const userMessages = session.messages
                .filter((m) => m.role === "user" && m.content.length > 20)
                .map((m) => m.content);
            if (userMessages.length > 0) {
                sessionPrompts.push({
                    sessionId: session.id,
                    prompts: userMessages.slice(0, 3), // first 3 messages for topic detection
                });
            }
        }
        if (sessionPrompts.length < MIN_SESSIONS_FOR_REPETITION)
            return [];
        // Ask LLM to find repeated topics and knowledge worth saving
        const prompt = `Analyze these user prompts across ${sessionPrompts.length} sessions to find:
1. **Repeated topics**: The user asked about the same thing in multiple sessions (sign they should save the answer)
2. **Re-explanation patterns**: The user provides the same context/background repeatedly (sign they should add it to a CLAUDE.md or memory)
3. **Unsaved knowledge**: Sessions that produced valuable reference info that wasn't persisted

Session prompts (first 3 messages each):
${sessionPrompts.slice(0, 30).map((sp) => `
Session ${sp.sessionId}:
${sp.prompts.map((p) => `  - "${p.slice(0, 150)}${p.length > 150 ? "..." : ""}"`).join("\n")}
`).join("\n")}

For each finding, respond with a JSON array of insights:
- module: "knowledge-nudges"
- severity: "suggestion"
- title: short description of what to save
- observation: what pattern was detected
- action: { type: "save", content: "consolidated summary of what to save", destination: "CLAUDE.md or project memory" }
- evidence: [{ sessions: ["session-ids"], metric: "how many times" }]
- effort: "low", impact: "medium", confidence: 0.0-1.0
- deduplicationKey: "nudge:{topic-hash}"

Return [] if no clear repetition. Max 3 insights.`;
        try {
            const insights = await input.llm.analyzeStructured(prompt, { type: "array" });
            if (!Array.isArray(insights))
                return [];
            return insights.map((i) => ({ ...i, module: this.name }));
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=knowledge-nudges.js.map