import { describe, expect, it } from "vitest";
import { buildDraftDiff, diffPublishCopy, diffScenes } from "../src/app/diff.ts";
import { buildTimeline, sampleAssets, sampleConfig } from "../src/app/timeline.ts";

const base = buildTimeline(sampleConfig, sampleAssets, 0);
const other = buildTimeline(sampleConfig, sampleAssets, 1);

describe("draft diff", () => {
  it("reports changed scenes and fields between two drafts", () => {
    const diff = buildDraftDiff(base, other);
    expect(diff.changedScenes).toBeGreaterThan(0);
    expect(diff.sceneDiffs.length).toBe(base.scenes.length);
    expect(diff.identical).toBe(false);
  });

  it("detects identical drafts", () => {
    const diff = buildDraftDiff(base, base);
    expect(diff.identical).toBe(true);
    expect(diff.changedFieldCount).toBe(0);
  });

  it("detects publish copy changes", () => {
    const edited = {
      ...base,
      publishCopy: { ...base.publishCopy, title: "改过的标题" },
    };
    const publish = diffPublishCopy(base, edited);
    expect(publish.titleChanged).toBe(true);
    expect(publish.bodyChanged).toBe(false);
    expect(buildDraftDiff(base, edited).publish.titleChanged).toBe(true);
  });

  it("flags asset and duration changes per scene", () => {
    const edited = {
      ...base,
      scenes: base.scenes.map((scene, index) =>
        index === 0 ? { ...scene, asset: sampleAssets[1], duration: scene.duration + 1 } : scene,
      ),
    };
    const diff = buildDraftDiff(base, edited);
    const hook = diff.sceneDiffs.find((scene) => scene.sceneId === "hook");
    expect(hook?.changed).toContain("asset");
    expect(hook?.changed).toContain("duration");
    expect(diff.durationDelta).toBe(1);
    expect(diff.assetChanges).toBe(1);
  });

  it("marks scenes missing in B", () => {
    const shorter = { ...base, scenes: base.scenes.slice(0, 4) };
    const diff = buildDraftDiff(base, shorter);
    const cta = diff.sceneDiffs.find((scene) => scene.sceneId === "cta");
    expect(cta?.missingInB).toBe(true);
    expect(diff.sceneCountB).toBe(4);
  });

  it("counts total changed fields across scenes and publish copy", () => {
    const edited = {
      ...base,
      publishCopy: { ...base.publishCopy, commentPrompt: "新的 CTA" },
      scenes: base.scenes.map((scene, index) =>
        index === 1 ? { ...scene, headline: "新的画面大字" } : scene,
      ),
    };
    const diff = buildDraftDiff(base, edited);
    expect(diff.changedFieldCount).toBe(2);
  });
});
