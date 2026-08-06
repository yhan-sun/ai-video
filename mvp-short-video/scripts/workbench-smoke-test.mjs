#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDrafts, readJson, writeJson } from "./timeline-core.mjs";
import { syncWorkbenchExport } from "./sync-workbench-export.mjs";
import { TimelineSchema, SCHEMA_VERSION } from "../src/contract/schema.ts";
import { migrateTimeline } from "../src/contract/migration.ts";

const merchant = readJson("data/merchant.example.json");
const rules = {
  count: 4,
  templateIds: ["checklist"],
  tone: "direct",
  minDuration: 20,
  maxDuration: 20,
};

const drafts = buildDrafts(merchant, { count: rules.count, rules });
assert.equal(drafts.length, 4, "generates the requested draft count");
assert.ok(
  drafts.every((draft) => draft.template === "checklist"),
  "respects template selection",
);
assert.ok(
  drafts.every((draft) => draft.scenes.reduce((total, scene) => total + scene.duration, 0) === 20),
  "fits drafts into the requested duration range",
);
assert.ok(drafts[0].publishCopy.body.includes("别急着下单"), "applies selected tone copy");
assert.ok(
  drafts[0].scenes.every((scene) => scene.asset && scene.assetType !== "none"),
  "matches sample assets",
);
assert.ok(
  drafts.every(
    (draft) =>
      draft.schemaVersion === SCHEMA_VERSION && draft.draftId && draft.reviewState === "pending",
  ),
  "emits schema version, stable draft id and pending review state",
);
assert.ok(
  new Set(drafts.map((draft) => draft.draftId)).size === 4,
  "draft ids are unique per draft",
);
assert.ok(
  drafts.every((draft) => TimelineSchema.safeParse(draft).success),
  "generated drafts pass the shared zod contract",
);

const approve = (timeline) => ({
  ...timeline,
  reviewState: "approved",
  reviewedAt: new Date().toISOString(),
});
const approvedDrafts = drafts.map(approve);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clips-studio-"));
const currentInput = path.join(tempDir, "timeline-01.json");
const sampleOutput = path.join(tempDir, "sample.timeline.json");
const campaignDir = path.join(tempDir, "campaigns");
writeJson(currentInput, {
  ...approvedDrafts[0],
  exportMeta: {
    exportedAt: "2026-07-30T00:00:00.000Z",
  },
});

const currentSummary = syncWorkbenchExport(currentInput, sampleOutput, campaignDir);
assert.equal(currentSummary.mode, "current", "detects current timeline export");
assert.equal(
  readJson(sampleOutput).publishCopy.title,
  approvedDrafts[0].publishCopy.title,
  "writes current timeline",
);
assert.equal(
  currentSummary.campaignsWritten,
  0,
  "does not create campaign files for current export",
);

const batchInput = path.join(tempDir, "all-timelines.json");
writeJson(batchInput, {
  merchantConfig: merchant,
  generationRules: rules,
  selectedDraftIndex: 2,
  currentDraft: approvedDrafts[1],
  drafts: approvedDrafts,
});

const batchSummary = syncWorkbenchExport(batchInput, sampleOutput, campaignDir);
assert.equal(batchSummary.mode, "batch", "detects batch export payload");
assert.equal(
  readJson(sampleOutput).publishCopy.title,
  approvedDrafts[1].publishCopy.title,
  "writes selected current draft from batch",
);
assert.equal(batchSummary.campaignsWritten, 4, "writes every campaign timeline from batch export");
assert.equal(
  fs.readdirSync(campaignDir).filter((fileName) => fileName.endsWith(".timeline.json")).length,
  4,
  "creates campaign timeline files",
);

const unapprovedInput = path.join(tempDir, "unapproved.json");
writeJson(unapprovedInput, { currentDraft: drafts[0], drafts });
assert.throws(
  () => syncWorkbenchExport(unapprovedInput, sampleOutput, campaignDir),
  /未通过人工审核/,
  "blocks sync of unapproved drafts by default",
);
const forcedSummary = syncWorkbenchExport(unapprovedInput, sampleOutput, campaignDir, {
  force: true,
});
assert.equal(forcedSummary.blocked, 4, "force sync reports blocked drafts");
assert.equal(
  readJson(sampleOutput).publishCopy.title,
  drafts[0].publishCopy.title,
  "force sync writes first draft",
);

const legacyTimeline = {
  ...drafts[0],
  schemaVersion: undefined,
  draftId: undefined,
  reviewState: undefined,
};
delete legacyTimeline.schemaVersion;
delete legacyTimeline.draftId;
delete legacyTimeline.reviewState;
const migrated = migrateTimeline(legacyTimeline);
assert.equal(
  migrated.data.schemaVersion,
  SCHEMA_VERSION,
  "stamps schema version on legacy timelines",
);
assert.ok(TimelineSchema.safeParse(migrated.data).success, "migrated timeline passes the contract");

const evidenceTimeline = {
  ...approvedDrafts[0],
  sourceProposal: {
    angle: "避坑",
    hook: "h",
    pain: "p",
    proof: "q",
    offer: "o",
    cta: "c",
    needsHumanEvidence: true,
    evidenceNotes: "缺价格",
    state: "needsHumanEvidence",
    publishCopy: { title: "t", body: "b", hashtags: [], commentPrompt: "c" },
    scenes: approvedDrafts[0].scenes.map((scene) => ({
      type: scene.type,
      headline: scene.headline,
      subtitle: scene.subtitle,
      duration: scene.duration,
    })),
  },
};
const evidenceInput = path.join(tempDir, "evidence.json");
writeJson(evidenceInput, { currentDraft: evidenceTimeline, drafts: [evidenceTimeline] });
assert.throws(
  () => syncWorkbenchExport(evidenceInput, sampleOutput, campaignDir),
  /needsHumanEvidence/,
  "blocks sync when the draft needs human evidence",
);
const evidenceForced = syncWorkbenchExport(evidenceInput, sampleOutput, campaignDir, {
  force: true,
});
assert.equal(
  readJson(sampleOutput).sourceProposal.needsHumanEvidence,
  true,
  "forced sync keeps the needsHumanEvidence flag in the exported timeline",
);

console.log("Workbench smoke test passed");
