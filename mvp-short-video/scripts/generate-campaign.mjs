#!/usr/bin/env node
import { buildTimeline, parseGenerationRules, readJson, writeJson } from "./timeline-core.mjs";

const inputPath = process.argv[2] ?? "data/merchant.example.json";
const outputPath = process.argv[3] ?? "data/sample.timeline.json";
const rules = parseGenerationRules(process.argv.slice(4), 1);

const merchantConfig = readJson(inputPath);
const timeline = buildTimeline(merchantConfig, { rules });
writeJson(outputPath, timeline);

console.log("Generated " + outputPath);
console.log("Template: " + timeline.template + " / Tone: " + rules.tone);
console.log("Scenes: " + timeline.scenes.length);
console.log(
  "Duration: " + timeline.scenes.reduce((total, scene) => total + scene.duration, 0) + "s",
);
console.log(
  "Assets matched: " +
    timeline.scenes.filter((scene) => scene.asset).length +
    "/" +
    timeline.scenes.length,
);
console.log("Render with: npm run render");
