import { describe, expect, it } from "vitest";
import {
  ExportEnvelopeSchema,
  SCHEMA_VERSION,
  TimelineSchema,
  WORKSPACE_SCHEMA_VERSION,
  parseExportEnvelope,
  parseTimeline,
} from "../src/contract/schema.ts";
import {
  migrateExportEnvelope,
  migrateTimeline,
  migrateWorkspaceRecord,
} from "../src/contract/migration.ts";
import { buildDrafts, buildTimeline, sampleAssets, sampleConfig } from "../src/app/timeline.ts";

const makeTimeline = () => {
  const timeline = buildTimeline(sampleConfig, sampleAssets, 0);
  expect(timeline.draftId).toBe("draft-avoid-mistake-v0");
  return timeline;
};

describe("contract: shared zod schema", () => {
  it("parses generated timelines with schema version and draft id", () => {
    const timeline = makeTimeline();
    const parsed = parseTimeline(timeline);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.draftId).toBe("draft-avoid-mistake-v0");
    expect(parsed.scenes.length).toBe(5);
  });

  it("rejects timelines that miss core fields", () => {
    const timeline = makeTimeline();
    const broken = { ...timeline, scenes: [] };
    expect(TimelineSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects invalid scene durations", () => {
    const timeline = makeTimeline();
    const broken = {
      ...timeline,
      scenes: timeline.scenes.map((scene, index) =>
        index === 0 ? { ...scene, duration: 99 } : scene,
      ),
    };
    expect(TimelineSchema.safeParse(broken).success).toBe(false);
  });

  it("parses full export envelopes", () => {
    const drafts = buildDrafts(sampleConfig, sampleAssets, 4);
    const envelope = {
      exportedAt: "2026-08-05T00:00:00.000Z",
      product: "local-merchant-short-video-draft-workbench",
      merchantConfig: sampleConfig,
      generationRules: {
        count: 4,
        templateIds: ["checklist"],
        tone: "direct",
        minDuration: 20,
        maxDuration: 20,
      },
      selectedDraftId: drafts[0].draftId,
      assetLibrary: [],
      currentDraft: drafts[0],
      drafts,
    };
    const parsed = parseExportEnvelope(envelope);
    expect(parsed.drafts).toHaveLength(4);
    expect(ExportEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("keeps the renderable payload schema-compatible", () => {
    const timeline = makeTimeline();
    const payload = {
      ...timeline,
      exportMeta: { exportedAt: "2026-08-05T00:00:00.000Z" },
    };
    expect(parseTimeline(payload).exportMeta?.exportedAt).toBe("2026-08-05T00:00:00.000Z");
  });
});

describe("contract: migration", () => {
  it("stamps schema version onto legacy timelines", () => {
    const timeline = makeTimeline();
    const legacy = { ...timeline };
    delete legacy.schemaVersion;
    delete legacy.draftId;

    const migrated = migrateTimeline(legacy);
    expect(migrated.data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.migratedFrom).toBe(0);
    expect(migrated.message).toContain("迁移");
  });

  it("throws on future schema versions", () => {
    const timeline = makeTimeline();
    const future = { ...timeline, schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migrateTimeline(future)).toThrow(/高于当前支持/);
  });

  it("migrates legacy workspace records and keeps numeric draft edits", () => {
    const legacy = {
      name: "测试商家",
      generationCount: 2,
      selectedTemplateIds: ["checklist"],
      tone: "practical",
      minDuration: 18,
      maxDuration: 24,
      draftEdits: { "0": { publishCopy: { title: "旧标题" } } },
      draftHistory: { "1": [] },
      selectedIndex: 1,
    };
    const migrated = migrateWorkspaceRecord(legacy, WORKSPACE_SCHEMA_VERSION);
    expect(migrated.data.workspaceVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(migrated.legacyDraftEdits).toEqual({ "0": { publishCopy: { title: "旧标题" } } });
    expect(migrated.legacySelectedIndex).toBe(1);
    expect(migrated.message).toContain("迁移");
  });

  it("throws on future workspace versions", () => {
    const future = { workspaceVersion: WORKSPACE_SCHEMA_VERSION + 1 };
    expect(() => migrateWorkspaceRecord(future, WORKSPACE_SCHEMA_VERSION)).toThrow(/高于当前支持/);
  });

  it("migrates batch export envelopes containing legacy drafts", () => {
    const drafts = buildDrafts(sampleConfig, sampleAssets, 2);
    const legacy = drafts.map((draft) => {
      const copy = { ...draft };
      delete copy.schemaVersion;
      return copy;
    });
    const envelope = { currentDraft: legacy[0], drafts: legacy };
    const migrated = migrateExportEnvelope(envelope);
    expect(migrated.data).toHaveLength(3);
    expect(migrated.data.every((draft) => draft.schemaVersion === SCHEMA_VERSION)).toBe(true);
  });
});
