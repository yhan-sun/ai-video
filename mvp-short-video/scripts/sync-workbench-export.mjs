#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateTimeline } from "../src/contract/migration.ts";
import { expandHome, readJson, writeJson } from "./timeline-core.mjs";

const approved = (timeline) => timeline.reviewState === "approved";

const needsHumanEvidence = (timeline) =>
  Boolean(
    timeline &&
    typeof timeline === "object" &&
    ((timeline.sourceProposal &&
      typeof timeline.sourceProposal === "object" &&
      timeline.sourceProposal.needsHumanEvidence === true) ||
      (timeline.generationMeta &&
        typeof timeline.generationMeta === "object" &&
        timeline.generationMeta.needsHumanEvidence === true)),
  );

const campaignFileName = (timeline, index) =>
  String(index + 1).padStart(2, "0") + "-" + (timeline.template ?? "draft") + ".timeline.json";

export const syncWorkbenchExport = (
  inputPath,
  outputPath = "data/sample.timeline.json",
  campaignDir = "data/campaigns",
  options = {},
) => {
  const force = Boolean(options.force);
  const resolvedInput = path.resolve(expandHome(inputPath));
  if (!fs.existsSync(resolvedInput)) {
    throw new Error("Input JSON not found: " + resolvedInput);
  }

  const payload = readJson(resolvedInput);
  const isBatch =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Array.isArray(payload.drafts);
  const sampleCandidate = isBatch && payload.currentDraft ? payload.currentDraft : payload;
  const draftList = isBatch ? payload.drafts : [payload];
  const sampleTimeline = migrateTimeline(sampleCandidate).data;
  const timelines = draftList.map((draft) => migrateTimeline(draft).data);

  const blocked = timelines.filter((timeline) => !approved(timeline));
  const evidenceBlocked = timelines.filter((timeline) => needsHumanEvidence(timeline));

  if (evidenceBlocked.length > 0 && !force) {
    throw new Error(
      "同步被阻止：" +
        evidenceBlocked.length +
        " 条草稿标记了 needsHumanEvidence（生成时证据不足，需人工补充价格、优惠、销量、评价或距离等事实并重新审核）。" +
        "确认风险后可 --force 覆盖，但导出包仍会保留该标记。",
    );
  }

  if (blocked.length > 0 && !force) {
    throw new Error(
      "同步被阻止：" +
        blocked.length +
        " 条草稿未通过人工审核（reviewState 未标记为 approved）。" +
        "请先在 Web 操作台标记审核通过，或确认风险后使用 --force 覆盖。",
    );
  }

  if (!approved(sampleTimeline) && !force) {
    throw new Error("同步被阻止：当前选中的草稿未通过人工审核。");
  }

  writeJson(outputPath, sampleTimeline);

  const summary = {
    inputPath: resolvedInput,
    samplePath: outputPath,
    campaignDir,
    campaignsWritten: 0,
    blocked: blocked.length,
    mode: isBatch ? "batch" : "current",
    migrated: null,
    force,
  };

  if (isBatch) {
    timelines.forEach((timeline, index) => {
      writeJson(path.join(campaignDir, campaignFileName(timeline, index)), timeline);
      summary.campaignsWritten += 1;
    });
  }

  return summary;
};

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const positional = args.filter((arg) => arg !== "--force");
  const inputPath = positional[0];
  const outputPath = positional[1] ?? "data/sample.timeline.json";
  const campaignDir = positional[2] ?? "data/campaigns";

  if (!inputPath) {
    console.error(
      "Usage: node scripts/sync-workbench-export.mjs <export-json> [sample-output] [campaign-dir] [--force]",
    );
    process.exit(1);
  }

  try {
    const summary = syncWorkbenchExport(inputPath, outputPath, campaignDir, { force });
    console.log("Synced current timeline to " + summary.samplePath);
    if (summary.campaignsWritten > 0) {
      console.log(
        "Synced " + summary.campaignsWritten + " campaign timelines to " + summary.campaignDir,
      );
    }
    if (summary.blocked > 0) {
      console.log("Blocked " + summary.blocked + " unapproved drafts (use --force to override)");
    }
    if (summary.migrated) {
      console.log("Migrated export data from schema v" + summary.migrated);
    }
    console.log(
      "Storyboard: node scripts/export-storyboard.mjs " +
        summary.samplePath +
        " out/storyboard.html",
    );
    console.log(
      "Render: npx remotion render src/index.ts VerticalDraft out/vertical-draft.mp4 --props=" +
        summary.samplePath,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
