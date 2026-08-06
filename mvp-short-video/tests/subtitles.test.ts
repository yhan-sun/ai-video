import { describe, expect, it } from "vitest";
import {
  buildAssignedSubtitlePatch,
  buildSubtitleScenePatch,
  subtitlesForScenes,
  subtitleWindowLabel,
} from "../src/app/subtitles.ts";
import { buildTimeline, sampleAssets, sampleConfig } from "../src/app/timeline.ts";
import { analyzeDraft, applyDraftEdit, withReviewReset } from "../src/app/analysis.ts";
import { SubtitleSourceSchema, type Transcript } from "../src/contract/schema.ts";

const transcript: Transcript = {
  language: "zh",
  model: "ggml-base.bin",
  segments: [
    { start: 0, end: 2.5, text: "第一次来大理" },
    { start: 2.5, end: 5, text: "别只看网红推荐" },
    { start: 5, end: 8, text: "院子安静停车方便" },
    { start: 8, end: 12, text: "亲子和情侣更适合" },
    { start: 12, end: 16, text: "评论区领取路线表" },
    { start: 16, end: 20, text: "收藏后慢慢看" },
  ],
};

describe("subtitles to scene copy", () => {
  const draft = buildTimeline(sampleConfig, sampleAssets, 0);

  it("splits transcript segments into per-scene windows", () => {
    const plans = subtitlesForScenes(draft, transcript);
    expect(plans.length).toBe(draft.scenes.length);
    expect(plans[0].sceneId).toBe("hook");
    expect(plans[0].text).toContain("第一次来大理");
    expect(plans[plans.length - 1].sceneId).toBe("cta");
    expect(plans[plans.length - 1].text).toContain("收藏后慢慢看");
    const offer = plans.find((plan) => plan.sceneId === "offer");
    expect(offer?.text).toContain("评论区领取路线表");
  });

  it("clamps long text to the subtitle limit", () => {
    const longTranscript: Transcript = {
      segments: Array.from({ length: 40 }, (_, index) => ({
        start: index,
        end: index + 1,
        text: "这是一段非常长的转写文本用来验证超长截断行为是否正确",
      })),
    };
    const plans = subtitlesForScenes(draft, longTranscript);
    expect(plans.every((plan) => plan.text.length <= 61)).toBe(true);
    expect(plans[0].text.endsWith("…")).toBe(true);
  });

  it("skips scenes outside the transcript range", () => {
    const shortTranscript: Transcript = {
      segments: [{ start: 0, end: 1, text: "只有开头" }],
    };
    const plans = subtitlesForScenes(draft, shortTranscript);
    expect(plans.length).toBe(1);
    expect(plans[0].sceneId).toBe("hook");
  });

  it("builds a scene patch with source markers", () => {
    const patch = buildSubtitleScenePatch(draft, transcript, "clips/vlog.mp4");
    const first = patch.hook;
    expect(first.subtitle).toBeTruthy();
    expect(first.subtitleSource).toEqual({
      asset: "clips/vlog.mp4",
      segmentStart: 0,
      segmentEnd: 5,
    });
    expect(SubtitleSourceSchema.safeParse(first.subtitleSource).success).toBe(true);
  });

  it("labels source windows in seconds", () => {
    const applied = applyDraftEdit(
      draft,
      withReviewReset({
        scenes: buildSubtitleScenePatch(draft, transcript, "clips/vlog.mp4"),
      }),
    );
    expect(subtitleWindowLabel(applied.scenes[0])).toBe("0.0–5.0s");
    expect(subtitleWindowLabel(applied.scenes[1])).toBe("2.5–8.0s");
  });

  it("keeps review pending and source marker after applying subtitles", () => {
    const applied = applyDraftEdit(
      draft,
      withReviewReset({
        reviewState: "approved",
        scenes: buildSubtitleScenePatch(draft, transcript, "clips/vlog.mp4"),
      }),
    );
    expect(applied.reviewState).toBe("pending");
    expect(applied.scenes[0].subtitleSource?.asset).toBe("clips/vlog.mp4");
    const analysis = analyzeDraft(applied, sampleConfig, sampleAssets, {
      count: 10,
      templateIds: ["avoid-mistake"],
      tone: "practical",
      minDuration: 18,
      maxDuration: 24,
    });
    expect(analysis.checks.some((check) => check.label === "文案来源")).toBe(true);
  });

  it("clears the source marker when the user edits the subtitle manually", () => {
    const applied = applyDraftEdit(
      draft,
      withReviewReset({
        scenes: {
          hook: { subtitle: "人工修改的字幕" },
        },
      }),
    );
    expect(applied.scenes[0].subtitleSource).toBeUndefined();
    expect(applied.scenes[0].subtitle).toBe("人工修改的字幕");
  });
});

describe("manual segment assignment", () => {
  const draft = buildTimeline(sampleConfig, sampleAssets, 0);

  it("groups assigned segments per scene and sorts by time", () => {
    const assignments = [
      { index: 4, sceneId: "cta" }, // 12-16s 评论区领取路线表
      { index: 5, sceneId: "cta" }, // 16-20s 收藏后慢慢看
      { index: 2, sceneId: "hook" }, // 5-8s 院子安静停车方便
      { index: 3, sceneId: null }, // 不填入
    ];
    const patch = buildAssignedSubtitlePatch(draft, transcript, "clips/vlog.mp4", assignments);
    expect(patch.cta.subtitle).toContain("评论区领取路线表");
    expect(patch.cta.subtitle).toContain("收藏后慢慢看");
    expect(patch.cta.subtitleSource).toEqual({
      asset: "clips/vlog.mp4",
      segmentStart: 12,
      segmentEnd: 20,
    });
    expect(patch.hook.subtitle).toContain("院子安静停车方便");
  });

  it("falls back to window-based assignment for unassigned segments", () => {
    const assignments = [{ index: 0, sceneId: "hook" }];
    const patch = buildAssignedSubtitlePatch(draft, transcript, "clips/vlog.mp4", assignments);
    // 0 号段显式归 hook；其余自动按窗口归属。
    expect(patch.hook.subtitle).toContain("第一次来大理");
    expect(patch.pain).toBeTruthy();
    expect(patch.proof).toBeTruthy();
  });

  it("ignores invalid segment indexes and scene ids", () => {
    const patch = buildAssignedSubtitlePatch(draft, transcript, "clips/vlog.mp4", [
      { index: 99, sceneId: "cta" },
      { index: 0, sceneId: "not-a-scene" },
      { index: 1, sceneId: "pain" },
    ]);
    expect(patch.pain.subtitle).toContain("别只看网红推荐");
    // 无效指派被忽略后，相关 segment 按时间窗口自动归属（cta 窗口含“收藏后慢慢看”）。
    expect(patch.cta.subtitle).toContain("收藏后慢慢看");
    expect(patch.cta.subtitleSource.segmentEnd).toBe(20);
  });
});
