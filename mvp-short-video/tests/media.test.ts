import { describe, expect, it } from "vitest";
import { AssetMetaSchema, parseTimeline } from "../src/contract/schema.ts";
import { buildAssetLibrary } from "../src/app/assets.ts";
import { buildDrafts, sampleAssets, sampleConfig } from "../src/app/timeline.ts";

describe("media metadata contract", () => {
  it("accepts sourceClip and transcript on asset meta", () => {
    const meta = AssetMetaSchema.parse({
      path: "clips/vlog-0-5.mp4",
      type: "video",
      tags: ["证据"],
      imported: true,
      sourceClip: { originPath: "vlog", start: 0, duration: 5 },
      transcript: {
        language: "zh",
        model: "ggml-base.bin",
        segments: [
          { start: 0, end: 2.5, text: "大家好" },
          { start: 2.5, end: 5, text: "这是小院" },
        ],
      },
    });
    expect(meta.sourceClip?.duration).toBe(5);
    expect(meta.transcript?.segments).toHaveLength(2);
    expect(meta.transcript?.language).toBe("zh");
  });

  it("rejects malformed transcript segments", () => {
    const result = AssetMetaSchema.safeParse({
      path: "clips/x.mp4",
      type: "video",
      transcript: { segments: [{ start: -1, end: 1, text: "x" }] },
    });
    expect(result.success).toBe(false);
  });

  it("exposes transcript and sourceClip through the asset library", () => {
    const drafts = buildDrafts(sampleConfig, sampleAssets, 2);
    const library = buildAssetLibrary(
      [...sampleAssets, "clips/clip.mp4"],
      drafts,
      drafts[0],
      {},
      {},
      {},
      {
        "clips/clip.mp4": AssetMetaSchema.parse({
          path: "clips/clip.mp4",
          type: "video",
          tags: [],
          imported: true,
          sourceClip: { originPath: "vlog", start: 3, duration: 5 },
          transcript: { segments: [{ start: 0, end: 1, text: "你好" }] },
        }),
      },
    );
    const clip = library.find((item) => item.path === "clips/clip.mp4");
    expect(clip?.sourceClip?.start).toBe(3);
    expect(clip?.transcript?.segments[0]?.text).toBe("你好");
  });

  it("keeps the renderable payload schema-compatible with media fields", () => {
    const timeline = buildDrafts(sampleConfig, sampleAssets, 1)[0];
    const withMedia = {
      ...timeline,
      scenes: timeline.scenes.map((scene, index) =>
        index === 0 ? { ...scene, media: { objectFit: "contain", playbackRate: 1.5 } } : scene,
      ),
    };
    expect(parseTimeline(withMedia).scenes[0]?.media?.playbackRate).toBe(1.5);
  });
});
