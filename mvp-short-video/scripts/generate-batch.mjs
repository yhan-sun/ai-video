#!/usr/bin/env node
import path from "node:path";
import { buildDrafts, parseGenerationRules, readJson, writeJson } from "./timeline-core.mjs";

const inputPath = process.argv[2] ?? "data/merchant.example.json";
const outputDir = process.argv[3] ?? "data/campaigns";
const count = Number(process.argv[4] ?? 10);
const rules = parseGenerationRules(process.argv.slice(5), count);
const merchantConfig = readJson(inputPath);

const timelines = buildDrafts(merchantConfig, { count: rules.count, rules });

timelines.forEach((timeline, index) => {
  const fileName = String(index + 1).padStart(2, "0") + "-" + timeline.template + ".timeline.json";
  writeJson(path.join(outputDir, fileName), timeline);
});

console.log("Generated " + timelines.length + " timeline drafts in " + outputDir);
console.log(
  "Rules: " +
    rules.templateIds.join(",") +
    " / " +
    rules.tone +
    " / " +
    rules.minDuration +
    "-" +
    rules.maxDuration +
    "s",
);
console.log("First draft: " + timelines[0].publishCopy.title);
