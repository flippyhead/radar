#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config-loader.js";
import { Pipeline } from "./pipeline.js";
import { extractTopic } from "./enrichment/topic-extractor.js";
import { linkSessions } from "./enrichment/session-linker.js";
import { ClaudeCodeParser } from "./parsers/claude-code.js";
import { CoworkParser } from "./parsers/cowork.js";
import { RootCauseAnalyzer } from "./analyzers/root-cause.js";
import { DirectAutomationAnalyzer } from "./analyzers/direct-automation.js";
import { DecisionSupportAnalyzer } from "./analyzers/decision-support.js";
import { KnowledgeNudgesAnalyzer } from "./analyzers/knowledge-nudges.js";
import { ClaudeApiProvider } from "./llm/claude-api.js";
import { ClaudeCodeRuntimeProvider } from "./llm/claude-code-runtime.js";
import { MarkdownOutput } from "./outputs/markdown.js";
import { Parser } from "./parsers/parser.interface.js";
import { Analyzer } from "./analyzers/analyzer.interface.js";
import { OutputTarget } from "./outputs/output.interface.js";
import { LLMProvider } from "./llm/llm.interface.js";
import { Config } from "./types/config.js";
import { writeFile } from "fs/promises";

const program = new Command();

program
  .name("workflow-analyzer")
  .description("Analyze AI assistant sessions and surface actionable insights")
  .version("0.1.0");

program
  .command("run")
  .description("Run the full analysis pipeline")
  .option("-c, --config <path>", "Path to config YAML file")
  .option("--since <days>", "Number of days to look back", "7")
  .option("--llm <provider>", "LLM provider override (claude-api, claude-code)")
  .action(async (opts) => {
    const config = await loadConfig(opts.config);

    if (opts.since) config.analysis.lookbackDays = parseInt(opts.since, 10);
    if (opts.llm) config.llm.provider = opts.llm;

    const parsers = buildParsers(config);
    const analyzers = buildAnalyzers(config);
    const outputs = buildOutputs(config);
    const llm = buildLLM(config);

    const pipeline = new Pipeline({ parsers, analyzers, outputs, llm, config });
    const result = await pipeline.run();

    console.log(`\nAnalysis complete.`);
    console.log(`  Sessions: ${result.sessionCount}`);
    console.log(`  Insights: ${result.insights.length}`);
    console.log(`  Sources: ${result.metadata.sources.join(", ")}`);
    console.log(`  Modules: ${result.metadata.modulesRun.join(", ")}`);
  });

program
  .command("parse")
  .description("Parse sessions only (for Claude Code skill mode)")
  .option("-c, --config <path>", "Path to config YAML file")
  .option("--since <days>", "Number of days to look back", "7")
  .option("-o, --output <path>", "Output JSON file path", "/tmp/workflow-analyzer-parsed.json")
  .action(async (opts) => {
    const config = await loadConfig(opts.config);
    if (opts.since) config.analysis.lookbackDays = parseInt(opts.since, 10);

    const parsers = buildParsers(config);
    const since = new Date();
    since.setDate(since.getDate() - config.analysis.lookbackDays);

    const allSessions = [];
    for (const parser of parsers) {
      const sessions = await parser.parse({ since });
      allSessions.push(...sessions);
    }

    // Enrich: topic extraction + session linking
    for (const session of allSessions) {
      const topicResult = extractTopic(session);
      session.topic = topicResult.topic;
      session.category = topicResult.category;
    }
    const sessionGroups = linkSessions(allSessions);

    // Serialize (convert Dates to strings)
    const output = { sessions: allSessions, sessionGroups };
    await writeFile(opts.output, JSON.stringify(output, null, 2), "utf-8");
    console.log(`Parsed ${allSessions.length} sessions (${sessionGroups.length} groups) → ${opts.output}`);
  });

program
  .command("scan-deps")
  .description("Scan project dependencies for recent GitHub releases")
  .option("--since <days>", "Number of days to look back for releases", "7")
  .option("--include-dev", "Include devDependencies (default: production only)")
  .option("-p, --plugins <path>", "JSON file with plugin repo info to scan")
  .option("-o, --output <path>", "Output JSON file path")
  .action(async (opts) => {
    // Dynamic import to avoid loading deps module tree for other commands
    const { scanDeps } = await import("./commands/scan-deps.js");
    const config = await loadConfig(undefined);

    const projectsBasePath =
      config.sources["claude-code"]?.path || "~/.claude/projects";

    const sinceDays = parseInt(opts.since, 10);
    if (!Number.isFinite(sinceDays) || sinceDays <= 0) {
      console.error(`Invalid --since value: "${opts.since}". Must be a positive integer.`);
      process.exit(1);
    }

    const result = await scanDeps({
      projectsBasePath,
      sinceDays,
      includeDev: !!opts.includeDev,
      pluginsPath: opts.plugins,
    });

    const json = JSON.stringify(result, null, 2);

    if (opts.output) {
      const { writeFile } = await import("fs/promises");
      await writeFile(opts.output, json, "utf-8");
      let summary =
        `Scanned ${result.projectCount} projects, ${result.packageCount} packages, ` +
        `${result.reposResolved} repos → ${result.releases.length} releases`;
      if ("pluginsScanned" in result) {
        summary += `, ${(result as any).pluginsScanned} plugins (${(result as any).pluginsWithUpdates} with updates)`;
      }
      summary += ` → ${opts.output}`;
      console.log(summary);
    } else {
      console.log(json);
    }

    if (result.rateLimited) {
      console.error("Warning: GitHub rate limit reached. Results may be incomplete.");
    }
    if (result.errors.length > 0) {
      console.error(`${result.errors.length} errors encountered (see errors field in output).`);
    }
  });

program
  .command("publish")
  .description("Publish pre-computed insights (for Claude Code skill mode)")
  .option("-c, --config <path>", "Path to config YAML file")
  .option("-i, --insights <path>", "Insights JSON file path")
  .action(async (opts) => {
    if (!opts.insights) {
      console.error("--insights path is required");
      process.exit(1);
    }

    const config = await loadConfig(opts.config);
    const outputs = buildOutputs(config);
    const { readFile } = await import("fs/promises");
    const raw = await readFile(opts.insights, "utf-8");
    const data = JSON.parse(raw);

    for (const output of outputs) {
      await output.publish(data.insights, data.metadata);
    }

    console.log(`Published ${data.insights.length} insights.`);
  });

program.parse();

function buildParsers(config: Config): Parser[] {
  const parsers: Parser[] = [];
  const sources = config.sources;

  if (sources["claude-code"]?.enabled) {
    parsers.push(new ClaudeCodeParser(sources["claude-code"].path));
  }
  if (sources["cowork"]?.enabled) {
    parsers.push(new CoworkParser(sources["cowork"].path));
  }

  return parsers;
}

function buildAnalyzers(config: Config): Analyzer[] {
  const analyzers: Analyzer[] = [];
  const enabled = config.analyzers;

  if (enabled["root-cause"]) analyzers.push(new RootCauseAnalyzer());
  if (enabled["direct-automation"]) analyzers.push(new DirectAutomationAnalyzer());
  if (enabled["decision-support"]) analyzers.push(new DecisionSupportAnalyzer());
  if (enabled["knowledge-nudges"]) analyzers.push(new KnowledgeNudgesAnalyzer());

  return analyzers;
}

function buildOutputs(config: Config): OutputTarget[] {
  const outputs: OutputTarget[] = [];
  const outputConfig = config.outputs;

  if (outputConfig["markdown"]?.enabled && outputConfig["markdown"].path) {
    outputs.push(new MarkdownOutput(outputConfig["markdown"].path));
  }

  return outputs;
}

function buildLLM(config: Config): LLMProvider {
  switch (config.llm.provider) {
    case "claude-api":
      return new ClaudeApiProvider({ model: config.llm.model, apiKey: config.llm.apiKey });
    case "claude-code":
    default:
      return new ClaudeCodeRuntimeProvider();
  }
}
