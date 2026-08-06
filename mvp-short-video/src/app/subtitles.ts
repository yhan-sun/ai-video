// 字幕 → 分镜文案：把素材转写结果按分镜时间窗口切分，生成可填入分镜的辅助文案。
// subtitleSource 中的 segmentStart/segmentEnd 一律表示素材内的绝对时间（秒），
// 便于审核时对照原始素材核对文案出处。
import type { Scene, Timeline, Transcript, TranscriptSegment } from "../contract/schema.ts";
import { SUBTITLE_MAX } from "./timeline.ts";

export const DEFAULT_MAX_CHARS = SUBTITLE_MAX;

export type SceneSubtitlePlan = {
  sceneId: string;
  text: string;
  segments: TranscriptSegment[];
  segmentStart: number;
  segmentEnd: number;
};

export type SceneSubtitlePatchValue = {
  subtitle: string;
  subtitleSource: { asset: string; segmentStart: number; segmentEnd: number };
};

export type SceneSubtitlePatch = Record<string, SceneSubtitlePatchValue>;

export type SegmentAssignment = { index: number; sceneId: string | null };

const clampText = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength - 1) + "…" : trimmed;
};

const sceneWindow = (timeline: Timeline) => {
  const windows: Array<{ scene: Scene; start: number; end: number }> = [];
  let cursor = 0;
  timeline.scenes.forEach((scene) => {
    windows.push({ scene, start: cursor, end: cursor + scene.duration });
    cursor += scene.duration;
  });
  return windows;
};

export const subtitlesForScenes = (
  timeline: Timeline,
  transcript: Transcript,
  options: { maxChars?: number } = {},
): SceneSubtitlePlan[] => {
  const segments = transcript.segments ?? [];
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const plans: SceneSubtitlePlan[] = [];

  sceneWindow(timeline).forEach(({ scene, start, end }) => {
    const within = segments.filter((segment) => segment.start < end && segment.end > start);
    if (within.length === 0) {
      return;
    }
    const text = clampText(within.map((segment) => segment.text).join(" "), maxChars);
    plans.push({
      sceneId: scene.id,
      text,
      segments: within,
      segmentStart: within[0].start,
      segmentEnd: within[within.length - 1].end,
    });
  });

  return plans;
};

export const buildSubtitleScenePatch = (
  timeline: Timeline,
  transcript: Transcript,
  assetPath: string,
  options: { maxChars?: number } = {},
): SceneSubtitlePatch => {
  const plans = subtitlesForScenes(timeline, transcript, options);
  return Object.fromEntries(
    plans.map((plan) => [
      plan.sceneId,
      {
        subtitle: plan.text,
        subtitleSource: {
          asset: assetPath,
          segmentStart: plan.segmentStart,
          segmentEnd: plan.segmentEnd,
        },
      },
    ]),
  );
};

const toPatchValue = (
  sceneId: string,
  group: TranscriptSegment[],
  assetPath: string,
  maxChars: number,
): SceneSubtitlePatchValue => ({
  subtitle: clampText(group.map((segment) => segment.text).join(" "), maxChars),
  subtitleSource: {
    asset: assetPath,
    segmentStart: group[0].start,
    segmentEnd: group[group.length - 1].end,
  },
});

/**
 * 按人工指派的分镜归属生成字幕补丁：
 * 每个 segment 指派到某个分镜（或 null 表示不填入），同分镜的字幕按时间排序拼接。
 * 未指派的 segment 保留默认（按时间窗口自动归属）——通过 assignments 中 sceneId === "auto" 表达。
 */
export const buildAssignedSubtitlePatch = (
  timeline: Timeline,
  transcript: Transcript,
  assetPath: string,
  assignments: SegmentAssignment[],
  options: { maxChars?: number } = {},
): SceneSubtitlePatch => {
  const segments = transcript.segments ?? [];
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const groups = new Map<string, TranscriptSegment[]>();
  const autoAssigned = new Set<string>();

  assignments.forEach(({ index, sceneId }) => {
    const segment = segments[index];
    if (!segment) {
      return;
    }
    if (sceneId === "auto") {
      autoAssigned.add(segment.text + segment.start);
      return;
    }
    if (!sceneId || !timeline.scenes.some((scene) => scene.id === sceneId)) {
      return;
    }
    const group = groups.get(sceneId) ?? [];
    group.push(segment);
    groups.set(sceneId, group);
  });

  const patch: SceneSubtitlePatch = {};

  groups.forEach((group, sceneId) => {
    const ordered = [...group].sort((a, b) => a.start - b.start);
    patch[sceneId] = toPatchValue(sceneId, ordered, assetPath, maxChars);
  });

  // 未人工指派的 segment 按时间窗口自动归属到分镜（不覆盖已指派的分镜）。
  const unassigned = segments.filter((segment) => !autoAssigned.has(segment.text + segment.start));
  const autoPatch = buildSubtitleScenePatch(
    { ...timeline },
    { ...transcript, segments: unassigned },
    assetPath,
    options,
  );
  Object.entries(autoPatch).forEach(([sceneId, value]) => {
    if (!patch[sceneId]) {
      patch[sceneId] = value;
    }
  });

  return patch;
};

export const subtitleWindowLabel = (scene: Scene) => {
  if (!scene.subtitleSource) {
    return null;
  }
  const { segmentStart, segmentEnd } = scene.subtitleSource;
  return `${segmentStart.toFixed(1)}–${segmentEnd.toFixed(1)}s`;
};
