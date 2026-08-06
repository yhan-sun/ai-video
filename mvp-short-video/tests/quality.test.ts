import { describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, WORKSPACE_SCHEMA_VERSION, parseTimeline } from "../src/contract/schema.ts";
import { migrateTimeline, migrateWorkspaceRecord } from "../src/contract/migration.ts";
import {
  buildDrafts,
  buildDraftsDistinct,
  buildTimeline,
  draftFingerprint,
  matchIndustryProfile,
  sampleAssets,
  sampleConfig,
  fitText,
  BODY_MAX,
  HEADLINE_MAX,
  SUBTITLE_MAX,
  TITLE_MAX,
} from "../src/app/timeline.ts";
import { analyzeDraft, applyDraftEdit, withReviewReset } from "../src/app/analysis.ts";
import { createExportPackage } from "../src/app/export.ts";
import { ExportPackageSchema } from "../src/contract/schema.ts";
import { storyboardHtml } from "../src/app/storyboardHtml.ts";
import { timelineContentHash } from "../src/app/format.ts";
import {
  generateProposalsWithProvider,
  proposalToTimeline,
  stripCodeFence,
} from "../src/app/llm.ts";
import { buildAssetLibrary } from "../src/app/assets.ts";

const rules = {
  count: 10,
  templateIds: ["avoid-mistake", "hidden-gem", "comparison", "checklist"],
  tone: "practical",
  minDuration: 18,
  maxDuration: 24,
  seed: 7,
};

describe("generator: determinism and dedup", () => {
  it("is deterministic for the same seed", () => {
    const first = buildDraftsDistinct(sampleConfig, sampleAssets, 10, rules);
    const second = buildDraftsDistinct(sampleConfig, sampleAssets, 10, rules);
    expect(first.drafts.map(draftFingerprint)).toEqual(second.drafts.map(draftFingerprint));
  });

  it("differs when the seed changes", () => {
    const first = buildDraftsDistinct(sampleConfig, sampleAssets, 10, { ...rules, seed: 7 });
    const second = buildDraftsDistinct(sampleConfig, sampleAssets, 10, { ...rules, seed: 8 });
    expect(first.drafts.map(draftFingerprint)).not.toEqual(second.drafts.map(draftFingerprint));
  });

  it("deduplicates near-identical drafts and keeps the requested count", () => {
    const { drafts, dedupKept } = buildDraftsDistinct(sampleConfig, sampleAssets, 10, rules);
    expect(drafts).toHaveLength(10);
    expect(dedupKept).toBe(10);
    const fingerprints = new Set(drafts.map(draftFingerprint));
    expect(fingerprints.size).toBe(10);
  });

  it("emits distinct hooks, pains, proofs and CTAs across the batch", () => {
    const { drafts } = buildDraftsDistinct(sampleConfig, sampleAssets, 10, rules);
    const hooks = new Set(drafts.map((draft) => draft.scenes[0]?.headline));
    const pains = new Set(drafts.map((draft) => draft.scenes[1]?.headline));
    const ctas = new Set(drafts.map((draft) => draft.scenes[4]?.headline));
    expect(hooks.size).toBeGreaterThanOrEqual(4);
    expect(pains.size).toBeGreaterThanOrEqual(2);
    expect(ctas.size).toBeGreaterThanOrEqual(2);
  });

  it("records seed and input hash in generation meta", () => {
    const draft = buildTimeline(sampleConfig, sampleAssets, 3, rules);
    expect(draft.generationMeta?.seed).toBe(7);
    expect(draft.generationMeta?.inputHash).toBeTruthy();
    expect(draft.generationMeta?.industryProfile).toBe("minsu");
  });
});

describe("generator: industry templates and length constraints", () => {
  const catering = { ...sampleConfig, industry: "火锅店", brandStyle: "热闹、实惠" };
  const training = { ...sampleConfig, industry: "少儿编程培训" };

  it("matches industry profiles", () => {
    expect(matchIndustryProfile("民宿")?.id).toBe("minsu");
    expect(matchIndustryProfile("火锅店")?.id).toBe("catering");
    expect(matchIndustryProfile("果园")?.id).toBe("agri");
    expect(matchIndustryProfile("少儿编程培训")?.id).toBe("training");
  });

  it("uses industry-specific pain and offer leads", () => {
    const draft = buildTimeline(catering, sampleAssets, 2, rules);
    const body = draft.publishCopy.body;
    expect(body.length).toBeLessThanOrEqual(BODY_MAX + 1);
  });

  it("clamps every headline, subtitle, title and body to content limits", () => {
    const drafts = buildDraftsDistinct(sampleConfig, sampleAssets, 10, rules).drafts;
    for (const draft of drafts) {
      expect(draft.publishCopy.title.length).toBeLessThanOrEqual(TITLE_MAX + 1);
      for (const scene of draft.scenes) {
        expect(scene.headline.length).toBeLessThanOrEqual(HEADLINE_MAX + 1);
        if (scene.subtitle) {
          expect(scene.subtitle.length).toBeLessThanOrEqual(SUBTITLE_MAX + 1);
        }
      }
    }
  });

  it("fitText trims long values", () => {
    expect(fitText("一二三四五六七八", 4)).toBe("一二三…");
    expect(fitText("短文本", 4)).toBe("短文本");
  });
});

describe("contract migration: v1 -> v2 and workspace v3 -> v4", () => {
  it("migrates v1 timelines to the current schema version", () => {
    const v1 = buildTimeline(sampleConfig, sampleAssets, 0, rules);
    delete v1.generationMeta;
    delete v1.sourceProposal;
    delete v1.reviewMeta;
    const migrated = migrateTimeline(v1);
    expect(migrated.data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("keeps v2 timelines unchanged", () => {
    const v2 = buildTimeline(sampleConfig, sampleAssets, 0, rules);
    const migrated = migrateTimeline(v2);
    expect(migrated.migratedFrom).toBeUndefined();
  });

  it("migrates workspace v3 records to v4 with new defaults", () => {
    const v3 = {
      workspaceVersion: 3,
      name: "老商家",
      generationCount: 4,
      draftVariants: [0, 1, 2, 3],
    };
    const migrated = migrateWorkspaceRecord(v3, WORKSPACE_SCHEMA_VERSION);
    expect(migrated.data.workspaceVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(WORKSPACE_SCHEMA_VERSION).toBe(4);
    expect(migrated.migratedFrom).toBe(3);
  });
});

describe("review invalidation and evidence gate", () => {
  const draft = buildTimeline(sampleConfig, sampleAssets, 0, rules);

  it("stores and clears approvedContentHash on approval and mutation", () => {
    const approved = withReviewReset();
    approved.reviewState = "approved";
    approved.approvedContentHash = timelineContentHash(draft);
    approved.approvedAt = "2026-08-06T00:00:00.000Z";

    const invalidated = withReviewReset(approved);
    expect(invalidated.reviewState).toBe("pending");
    expect(invalidated.approvedContentHash).toBeUndefined();
    expect(invalidated.approvedAt).toBeUndefined();
    expect(invalidated.version).toBe(2);
  });

  it("blocks export when the proposal needs human evidence", () => {
    const withEvidence = {
      ...draft,
      sourceProposal: {
        angle: "x",
        hook: "h",
        pain: "p",
        proof: "q",
        offer: "o",
        cta: "c",
        needsHumanEvidence: true,
        evidenceNotes: "缺价格",
        state: "needsHumanEvidence" as const,
        publishCopy: { title: "t", body: "b", hashtags: [], commentPrompt: "c" },
        scenes: draft.scenes.map((scene) => ({
          type: scene.type,
          headline: scene.headline,
          subtitle: scene.subtitle,
          duration: scene.duration,
        })),
      },
    };
    const analysis = analyzeDraft(withEvidence, sampleConfig, sampleAssets, rules, "approved");
    expect(analysis.exportReady).toBe(false);
    expect(analysis.checks.some((check) => check.label === "证据完整性" && check.blocking)).toBe(
      true,
    );
  });

  it("blocks export when remote asset URLs are used", () => {
    const remote = {
      ...draft,
      scenes: draft.scenes.map((scene, index) =>
        index === 0 ? { ...scene, asset: "https://example.com/a.jpg" } : scene,
      ),
    };
    const analysis = analyzeDraft(remote, sampleConfig, sampleAssets, rules, "approved");
    expect(analysis.exportReady).toBe(false);
    expect(analysis.checks.some((check) => check.label === "远程素材" && check.blocking)).toBe(
      true,
    );
  });
});

describe("export package and storyboard", () => {
  const drafts = buildDraftsDistinct(sampleConfig, sampleAssets, 4, { ...rules, count: 4 }).drafts;
  const edits = Object.fromEntries(
    drafts.map((draft, index) => [
      draft.draftId ?? "",
      index < 2
        ? { reviewState: "approved" as const, approvedContentHash: "abc", approvedAt: "x" }
        : { publishCopy: { title: "改过" } },
    ]),
  );
  const library = buildAssetLibrary(sampleAssets, drafts, drafts[0], {}, {}, {}, {});

  it("exports only approved drafts with review metadata and status", () => {
    const pkg = createExportPackage({
      kind: "approved",
      config: sampleConfig,
      rules,
      drafts,
      assetLibrary: library,
      edits,
    });
    expect(pkg.drafts).toHaveLength(2);
    expect(ExportPackageSchema.safeParse(pkg).success).toBe(true);
    expect(pkg.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.values(pkg.reviewMeta).filter((meta) => meta.status === "approved")).toHaveLength(
      2,
    );
    expect(Object.values(pkg.reviewMeta).some((meta) => meta.status === "edited")).toBe(true);
  });

  it("storyboard html shares visual tokens and escapes text", () => {
    const html = storyboardHtml(drafts[0], { title: '测试"<标题>' });
    expect(html).toContain("--safe-top");
    expect(html).toContain("9 / 16");
    expect(html).not.toContain('测试"<');
    expect(html).toContain("schemaVersion");
  });
});

describe("llm proposals", () => {
  const llmConfig = {
    provider: "openai-compatible" as const,
    baseUrl: "https://example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
  };
  const validProposal = {
    angle: "避坑",
    hook: "第一次来大理别只看价格",
    pain: "网红房型容易踩坑",
    proof: "院子安静停车方便",
    offer: "领 3 天路线表",
    cta: "评论区打大理",
    needsHumanEvidence: true,
    evidenceNotes: "缺价格信息",
    state: "draft",
    publishCopy: {
      title: "第一次来大理别只看价格",
      body: "这条草稿适合第一次来大理的朋友。",
      hashtags: ["#大理"],
      commentPrompt: "评论区打大理",
    },
    scenes: [
      { type: "hook", headline: "第一次来大理别只看价格", subtitle: "先看这条", duration: 3 },
      { type: "pain", headline: "网红房型容易踩坑", subtitle: "细节", duration: 4 },
      { type: "proof", headline: "院子安静停车方便", subtitle: "证据", duration: 5 },
      { type: "offer", headline: "领 3 天路线表", subtitle: "价值", duration: 4 },
      { type: "cta", headline: "评论区打大理", subtitle: "转化", duration: 4 },
    ],
  };

  it("strips code fences from model output", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence("plain")).toBe("plain");
  });

  it("converts a valid proposal into a schema-valid timeline", () => {
    const timeline = proposalToTimeline(
      validProposal as never,
      sampleConfig,
      sampleAssets,
      rules,
      9001,
      {
        provider: "openai-compatible",
        model: "test-model",
        promptVersion: "draft-proposal-v1",
        inputHash: "h",
        generatedAt: "2026-08-06T00:00:00.000Z",
        repairCount: 1,
        needsHumanEvidence: true,
        evidenceNotes: "缺价格信息",
      },
    );
    expect(parseTimeline(timeline)).toBeTruthy();
    expect(timeline.generationMeta?.needsHumanEvidence).toBe(true);
    expect(timeline.sourceProposal?.needsHumanEvidence).toBe(true);
    expect(timeline.reviewState).toBe("pending");
  });

  it("marks evidence and repairs via a mocked provider round trip", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ bad: "invalid output" }) } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify([validProposal]) } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateProposalsWithProvider({
      config: sampleConfig,
      assets: sampleAssets,
      rules,
      count: 1,
      llmConfig,
    });
    vi.unstubAllGlobals();

    expect(result.error).toBeUndefined();
    expect(result.proposals).toHaveLength(1);
    expect(result.trace.repairCount).toBe(1);
    expect(result.trace.needsHumanEvidence).toBe(true);
    expect(result.trace.evidenceNotes).toBe("缺价格信息");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a readable error when the model never produces valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "not json" } }] }),
      }),
    );

    const result = await generateProposalsWithProvider({
      config: sampleConfig,
      assets: sampleAssets,
      rules,
      count: 1,
      llmConfig,
    });
    vi.unstubAllGlobals();

    expect(result.proposals).toHaveLength(0);
    expect(result.error).toContain("修复");
  });
});
