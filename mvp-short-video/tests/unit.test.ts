import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type Timeline } from "../src/contract/schema.ts";
import {
  buildDrafts,
  buildTimeline,
  defaultGenerationRules,
  draftIdOf,
  sampleAssets,
  sampleConfig,
  templateForVariant,
} from "../src/app/timeline.ts";
import { analyzeDraft, applyDraftEdit, withReviewReset } from "../src/app/analysis.ts";
import { exportGate } from "../src/app/export.ts";
import {
  buildAssetLibrary,
  inferAssetTags,
  isPlaceholderAsset,
  isSupportedAssetExtension,
  scenePreferredTags,
} from "../src/app/assets.ts";
import { aiSceneOrder, buildAIDurationPlan, createAIEditPatchForDraft } from "../src/app/ai.ts";

const rules = {
  count: 4,
  templateIds: ["checklist"],
  tone: "direct",
  minDuration: 20,
  maxDuration: 20,
};

describe("generation", () => {
  it("generates requested count and template", () => {
    const drafts = buildDrafts(sampleConfig, sampleAssets, 4, rules);
    expect(drafts).toHaveLength(4);
    expect(drafts.every((draft) => draft.template === "checklist")).toBe(true);
  });

  it("fits durations into the requested range", () => {
    const drafts = buildDrafts(sampleConfig, sampleAssets, 4, rules);
    const totals = drafts.map((draft) =>
      draft.scenes.reduce((total, scene) => total + scene.duration, 0),
    );
    expect(totals.every((total) => total >= 20 && total <= 20)).toBe(true);
  });

  it("applies tone copy", () => {
    const draft = buildTimeline(sampleConfig, sampleAssets, 0, rules);
    expect(draft.publishCopy.body).toContain("别急着下单");
  });

  it("assigns stable draft ids that survive regeneration", () => {
    const first = buildDrafts(sampleConfig, sampleAssets, 4, rules);
    const second = buildDrafts(sampleConfig, sampleAssets, 4, rules);
    expect(first.map((draft) => draft.draftId)).toEqual(second.map((draft) => draft.draftId));
    expect(new Set(first.map((draft) => draft.draftId)).size).toBe(4);
  });

  it("emits schema version and pending review by default", () => {
    const draft = buildTimeline(sampleConfig, sampleAssets, 0);
    expect(draft.schemaVersion).toBe(SCHEMA_VERSION);
    expect(draft.reviewState).toBe("pending");
  });

  it("changes draft id when the variant changes", () => {
    const first = buildTimeline(sampleConfig, sampleAssets, 3, rules);
    const regenerated = buildTimeline(sampleConfig, sampleAssets, 3 + 5, rules);
    expect(first.draftId).not.toBe(regenerated.draftId);
    expect(templateForVariant(3, rules)).toBe("checklist");
    expect(draftIdOf("checklist", 3)).toBe("draft-checklist-v3");
  });
});

describe("review analysis", () => {
  const draft = buildTimeline(sampleConfig, sampleAssets, 0, rules);

  it("blocks export until review is approved", () => {
    const analysis = analyzeDraft(draft, sampleConfig, sampleAssets, rules, "pending");
    expect(analysis.exportReady).toBe(false);
    expect(analysis.reviewComplete).toBe(false);

    const gate = exportGate(draft, analysis, undefined);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((reason) => reason.includes("人工审核"))).toBe(true);
  });

  it("passes gate when reviewed and clean", () => {
    const approved = { ...draft, reviewState: "approved" as const };
    const analysis = analyzeDraft(approved, sampleConfig, sampleAssets, rules, "approved");
    const edit = withReviewReset();
    edit.reviewState = "approved";
    const gate = exportGate(approved, analysis, edit);
    expect(gate.ok).toBe(true);
  });

  it("flags missing assets as blocking", () => {
    const analysis = analyzeDraft(draft, sampleConfig, [], rules, "approved");
    expect(analysis.missingAssets).toBeGreaterThan(0);
    expect(analysis.exportReady).toBe(false);
  });

  it("flags empty headline as blocking", () => {
    const broken = {
      ...draft,
      scenes: draft.scenes.map((scene, index) =>
        index === 0 ? { ...scene, headline: "  " } : scene,
      ),
    };
    const analysis = analyzeDraft(broken, sampleConfig, sampleAssets, rules, "approved");
    expect(analysis.blockingCount).toBeGreaterThan(0);
  });

  it("warns when duration falls outside rules", () => {
    const rulesLong = { ...rules, minDuration: 40, maxDuration: 40 };
    const analysis = analyzeDraft(draft, sampleConfig, sampleAssets, rulesLong, "approved");
    expect(analysis.warningCount).toBeGreaterThan(0);
  });

  it("resets review state on any edit mutation", () => {
    const edit = withReviewReset({
      publishCopy: { title: "新标题" },
      reviewState: "approved",
      reviewedAt: "2026-08-05T00:00:00.000Z",
    });
    expect(edit.reviewState).toBe("pending");
    expect(edit.reviewedAt).toBeUndefined();
    expect(edit.version).toBe(1);
  });

  it("applies edits and carries review state into the timeline", () => {
    const edit = withReviewReset({
      publishCopy: { title: "新标题" },
      reviewState: "approved",
    });
    const applied: Timeline = applyDraftEdit(draft, edit);
    expect(applied.publishCopy.title).toBe("新标题");
    expect(applied.reviewState).toBe("pending");
  });
});

describe("assets", () => {
  it("infers tags from filenames", () => {
    expect(inferAssetTags("assets/hero-room.svg")).toContain("环境");
    expect(inferAssetTags("assets/review-proof.png")).toContain("证据");
    expect(inferAssetTags("assets/menu-dish.jpg")).toContain("菜品");
  });

  it("validates supported extensions", () => {
    expect(isSupportedAssetExtension("assets/a.mp4")).toBe(true);
    expect(isSupportedAssetExtension("assets/a.jpg")).toBe(true);
    expect(isSupportedAssetExtension("assets/a.exe")).toBe(false);
    expect(isSupportedAssetExtension("assets/a")).toBe(false);
  });

  it("detects placeholder scenes", () => {
    const missing = buildTimeline({ ...sampleConfig, name: "x" }, [], 0);
    expect(isPlaceholderAsset(missing.scenes[0], ["assets/hero-courtyard.svg"])).toBe(true);

    const matched = buildTimeline(sampleConfig, sampleAssets, 0);
    expect(isPlaceholderAsset(matched.scenes[0], sampleAssets)).toBe(false);
  });

  it("builds the asset library with usage counts", () => {
    const drafts = buildDrafts(sampleConfig, sampleAssets, 4, rules);
    const library = buildAssetLibrary(sampleAssets, drafts, drafts[0], {}, {}, {});
    expect(library).toHaveLength(4);
    expect(library.every((asset) => asset.usedInAll > 0)).toBe(true);
    expect(scenePreferredTags.hook).toContain("环境");
  });
});

describe("ai edit plans", () => {
  const draft = buildTimeline(sampleConfig, sampleAssets, 0, rules);
  const edit = withReviewReset();
  edit.reviewState = "approved";

  it("reorders scenes per mode priority", () => {
    const order = aiSceneOrder(draft, "story");
    expect(order).toEqual(["hook", "proof", "pain", "offer", "cta"]);
  });

  it("respects locked durations", () => {
    const locked = {
      scenes: {
        hook: { duration: true },
      },
    };
    const plan = buildAIDurationPlan(draft, "pacing", rules, locked);
    expect(plan.durations.hook).toBe(draft.scenes[0].duration);
  });

  it("always resets review state when generating a patch", () => {
    const patch = createAIEditPatchForDraft({
      draft,
      draftIndex: 0,
      mode: "pacing",
      edit: { reviewState: "approved", reviewedAt: "x" },
      config: sampleConfig,
      assetList: sampleAssets,
      assetLibrary: buildAssetLibrary(sampleAssets, [draft], draft, {}, {}, {}),
      rules,
    });
    expect(patch.reviewState).toBe("pending");
    expect(patch.reviewedAt).toBeUndefined();
  });
});

describe("generation rules defaults", () => {
  it("keeps stable defaults", () => {
    expect(defaultGenerationRules.count).toBe(10);
    expect(defaultGenerationRules.templateIds).toEqual([
      "avoid-mistake",
      "hidden-gem",
      "comparison",
      "checklist",
    ]);
  });
});
