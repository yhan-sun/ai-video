import {
  type GenerationRules,
  type MerchantConfig,
  type Scene,
  type SceneType,
  type Timeline,
} from "../contract/schema.ts";
import {
  clampNumber,
  durationOf,
  normalizeAssetPath,
  pickConfigItem,
  sameStringArray,
} from "./format.ts";
import { isPlaceholderAsset, pickAssetForScene } from "./assets.ts";
import { applyDraftEdit, countDraftLocks } from "./analysis.ts";
import type {
  AIEditDiff,
  AIEditMode,
  AIEditPlan,
  AIEditSuggestion,
  AssetItem,
  DraftAnalysis,
  DraftEdit,
  DraftLocks,
  SceneEdit,
} from "./types.ts";

export const aiEditModes: Array<{ id: AIEditMode; label: string; detail: string }> = [
  { id: "pacing", label: "节奏压缩", detail: "压短铺垫，强化 3 秒钩子和快节奏转场。" },
  { id: "story", label: "故事加强", detail: "先给体验证据，再回到痛点，适合民宿/服务类。" },
  { id: "conversion", label: "转化强化", detail: "让 CTA、优惠和评论引导更明确。" },
  { id: "asset", label: "素材优先", detail: "按素材覆盖重排和补齐，减少占位画面。" },
];

export const aiModeLabel = Object.fromEntries(
  aiEditModes.map((mode) => [mode.id, mode.label]),
) as Record<AIEditMode, string>;

const clampText = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength - 1) + "…" : trimmed;
};

export const aiClampText = clampText;

export const aiSceneOrder = (timeline: Timeline, mode: AIEditMode) => {
  const priority: Record<AIEditMode, SceneType[]> = {
    pacing: ["hook", "pain", "proof", "offer", "cta"],
    story: ["hook", "proof", "pain", "offer", "cta"],
    conversion: ["hook", "pain", "proof", "offer", "cta"],
    asset: ["hook", "proof", "pain", "offer", "cta"],
  };

  return [...timeline.scenes]
    .sort((a, b) => priority[mode].indexOf(a.type) - priority[mode].indexOf(b.type))
    .map((scene) => scene.id);
};

export const aiDurationForScene = (scene: Scene, mode: AIEditMode) => {
  const presets: Record<AIEditMode, Record<SceneType, number>> = {
    pacing: { hook: 3, pain: 3, proof: 4, offer: 3, cta: 3 },
    story: { hook: 3, pain: 4, proof: 5, offer: 4, cta: 4 },
    conversion: { hook: 3, pain: 4, proof: 4, offer: 4, cta: 5 },
    asset: { hook: 3, pain: 4, proof: 4, offer: 4, cta: 4 },
  };

  return presets[mode][scene.type] ?? scene.duration;
};

export const aiTargetDuration = (timeline: Timeline, rules: GenerationRules, mode: AIEditMode) => {
  const minDuration = clampNumber(rules.minDuration, 10, 60);
  const maxDuration = clampNumber(rules.maxDuration, minDuration, 60);
  const range = maxDuration - minDuration;
  const modeTarget: Record<AIEditMode, number> = {
    pacing: minDuration + Math.round(range * 0.25),
    story: minDuration + Math.round(range * 0.75),
    conversion: minDuration + Math.round(range * 0.5),
    asset: minDuration + Math.round(range * 0.5),
  };

  return clampNumber(modeTarget[mode] || durationOf(timeline), minDuration, maxDuration);
};

export const buildAIDurationPlan = (
  timeline: Timeline,
  mode: AIEditMode,
  rules: GenerationRules,
  locks?: DraftLocks,
) => {
  const targetDuration = aiTargetDuration(timeline, rules, mode);
  const lockedSceneIds = new Set(
    timeline.scenes.filter((scene) => locks?.scenes?.[scene.id]?.duration).map((scene) => scene.id),
  );
  const flexibleScenes = timeline.scenes.filter((scene) => !lockedSceneIds.has(scene.id));
  const lockedTotal = timeline.scenes
    .filter((scene) => lockedSceneIds.has(scene.id))
    .reduce((total, scene) => total + scene.duration, 0);
  const flexibleTarget = clampNumber(
    targetDuration - lockedTotal,
    flexibleScenes.length * 2,
    flexibleScenes.length * 10,
  );
  const baseTotal =
    flexibleScenes.reduce((total, scene) => total + aiDurationForScene(scene, mode), 0) || 1;
  const durationMap: Record<string, number> = {};

  timeline.scenes.forEach((scene) => {
    if (lockedSceneIds.has(scene.id)) {
      durationMap[scene.id] = scene.duration;
    }
  });

  const flexibleDurations = flexibleScenes.map((scene) =>
    clampNumber(Math.round((aiDurationForScene(scene, mode) / baseTotal) * flexibleTarget), 2, 10),
  );
  let diff = flexibleTarget - flexibleDurations.reduce((total, duration) => total + duration, 0);
  let cursor = 0;

  while (diff !== 0 && cursor < 100 && flexibleDurations.length > 0) {
    const index = cursor % flexibleDurations.length;
    const next = flexibleDurations[index] + (diff > 0 ? 1 : -1);

    if (next >= 2 && next <= 10) {
      flexibleDurations[index] = next;
      diff += diff > 0 ? -1 : 1;
    }

    cursor += 1;
  }

  flexibleScenes.forEach((scene, index) => {
    durationMap[scene.id] = flexibleDurations[index] ?? scene.duration;
  });

  return {
    targetDuration,
    durations: durationMap,
    predictedDuration: timeline.scenes.reduce(
      (total, scene) => total + (durationMap[scene.id] ?? scene.duration),
      0,
    ),
  };
};

export const aiHeadlineForScene = (
  scene: Scene,
  config: MerchantConfig,
  mode: AIEditMode,
  index: number,
) => {
  const sellingPoint = pickConfigItem(config.sellingPoints, index, "更省心的选择");
  const painPoint = pickConfigItem(config.painPoints, index, "别只看表面推荐");
  const proofPoint = pickConfigItem(config.proofPoints, index, sellingPoint);
  const keyword = config.keyword || config.location || "攻略";

  if (scene.type === "hook") {
    if (mode === "conversion") {
      return clampText(config.location + config.industry + "怎么选？先看这条", 28);
    }
    if (mode === "story") {
      return clampText("第一次来" + config.location.replace(/^云南/, "") + "，先听真实体验", 30);
    }
    return clampText(config.hook || scene.headline, 30);
  }

  if (scene.type === "pain") {
    return clampText("别踩坑：" + painPoint, 30);
  }

  if (scene.type === "proof") {
    return clampText(mode === "story" ? proofPoint : "真正值得看的是：" + proofPoint, 32);
  }

  if (scene.type === "offer") {
    return clampText(config.offer || "领取完整清单", 32);
  }

  return clampText(config.cta || "想要攻略，评论区打“" + keyword + "”", 32);
};

export const aiSubtitleForScene = (
  scene: Scene,
  config: MerchantConfig,
  mode: AIEditMode,
  index: number,
) => {
  const sellingPoint = pickConfigItem(config.sellingPoints, index + 1, "省心、真实、可执行");
  const proofPoint = pickConfigItem(config.proofPoints, index + 1, sellingPoint);

  if (scene.type === "hook") {
    return mode === "pacing" ? "3 秒讲清重点，后面直接给判断标准" : config.audience + "先看这一条";
  }

  if (scene.type === "pain") {
    return "先把容易踩坑的选择排除掉";
  }

  if (scene.type === "proof") {
    return mode === "asset" ? "优先匹配证据素材和真实画面" : proofPoint;
  }

  if (scene.type === "offer") {
    return "把可领取、可咨询、可收藏的价值讲清楚";
  }

  return "评论区关键词要短、明确、方便用户照做";
};

export const aiPublishCopy = (timeline: Timeline, config: MerchantConfig, mode: AIEditMode) => {
  const painPoint = pickConfigItem(
    config.painPoints,
    0,
    timeline.scenes[1]?.headline ?? "先避开常见误区",
  );
  const sellingPoints = config.sellingPoints.slice(0, 3).join("、") || "位置、体验、服务细节";
  const cta = config.cta || timeline.publishCopy.commentPrompt;
  const hookScene = timeline.scenes.find((scene) => scene.type === "hook") ?? timeline.scenes[0];
  const hookHeadline = hookScene
    ? aiHeadlineForScene(hookScene, config, mode, 0).replace(/^先收藏：/, "")
    : timeline.publishCopy.title;
  const titlePrefix =
    mode === "conversion"
      ? "想少踩坑，先看"
      : mode === "story"
        ? "真实体验："
        : mode === "asset"
          ? "实拍素材："
          : "先收藏：";

  return {
    title: clampText(titlePrefix + hookHeadline, 34),
    body: [
      config.name + "这条草稿主打：" + painPoint,
      "剪辑重点：前 3 秒给判断标准，中段用素材证明，结尾给清楚 CTA。",
      "推荐卖点：" + sellingPoints + "。",
      cta,
    ].join("\n"),
    hashtags: Array.from(new Set([...timeline.publishCopy.hashtags, ...config.hashtags])).slice(
      0,
      8,
    ),
    commentPrompt: cta,
  };
};

export const createAIEditPatchForDraft = ({
  draft,
  draftIndex,
  mode,
  edit,
  config,
  assetList,
  assetLibrary,
  rules,
}: {
  draft: Timeline;
  draftIndex: number;
  mode: AIEditMode;
  edit?: DraftEdit;
  config: MerchantConfig;
  assetList: string[];
  assetLibrary: AssetItem[];
  rules: GenerationRules;
}): DraftEdit => {
  const scenes: Record<string, SceneEdit> = {};
  const durationPlan = buildAIDurationPlan(draft, mode, rules, edit?.locks);

  draft.scenes.forEach((scene, sceneIndex) => {
    const sceneLocks = edit?.locks?.scenes?.[scene.id] ?? {};
    const scenePatch: SceneEdit = {};

    if (!sceneLocks.duration) {
      scenePatch.duration = durationPlan.durations[scene.id] ?? aiDurationForScene(scene, mode);
    }

    if (!sceneLocks.headline) {
      scenePatch.headline = aiHeadlineForScene(scene, config, mode, sceneIndex + draftIndex);
    }

    if (!sceneLocks.subtitle) {
      scenePatch.subtitle = aiSubtitleForScene(scene, config, mode, sceneIndex + draftIndex);
    }

    const shouldReplaceAsset = mode === "asset" || isPlaceholderAsset(scene, assetList);
    if (!sceneLocks.asset && shouldReplaceAsset) {
      const asset = pickAssetForScene(scene, assetLibrary, draftIndex + sceneIndex);
      if (asset) {
        scenePatch.asset = asset.path;
        scenePatch.assetType = asset.type;
      }
    }

    if (Object.keys(scenePatch).length > 0) {
      scenes[scene.id] = scenePatch;
    }
  });

  const publishCopy = aiPublishCopy(draft, config, mode);
  const publishLocks = edit?.locks?.publish ?? {};

  return {
    ...(edit ?? {}),
    updatedAt: new Date().toISOString(),
    reviewState: "pending",
    reviewedAt: undefined,
    version: (edit?.version ?? 0) + 1,
    sceneOrder: aiSceneOrder(draft, mode),
    publishCopy: {
      ...(edit?.publishCopy ?? {}),
      ...(!publishLocks.title ? { title: publishCopy.title } : {}),
      ...(!publishLocks.body ? { body: publishCopy.body } : {}),
      ...(!publishLocks.commentPrompt ? { commentPrompt: publishCopy.commentPrompt } : {}),
      ...(!publishLocks.hashtags ? { hashtags: publishCopy.hashtags } : {}),
    },
    scenes: {
      ...(edit?.scenes ?? {}),
      ...scenes,
    },
  };
};

export const buildAIEditDiff = (
  before: Timeline,
  after: Timeline,
  locks?: DraftLocks,
): AIEditDiff => {
  const textChanges = [
    before.publishCopy.title !== after.publishCopy.title,
    before.publishCopy.body !== after.publishCopy.body,
    before.publishCopy.commentPrompt !== after.publishCopy.commentPrompt,
    !sameStringArray(before.publishCopy.hashtags, after.publishCopy.hashtags),
    ...before.scenes.flatMap((scene) => {
      const next = after.scenes.find((item) => item.id === scene.id);
      return [
        Boolean(next && scene.headline !== next.headline),
        Boolean(next && (scene.subtitle ?? "") !== (next.subtitle ?? "")),
        Boolean(next && scene.duration !== next.duration),
      ];
    }),
  ].filter(Boolean).length;
  const assetChanges = before.scenes.filter((scene) => {
    const next = after.scenes.find((item) => item.id === scene.id);
    return Boolean(
      next && normalizeAssetPath(scene.asset ?? "") !== normalizeAssetPath(next.asset ?? ""),
    );
  }).length;
  const beforeOrder = before.scenes.map((scene) => scene.id);
  const afterOrder = after.scenes.map((scene) => scene.id);
  const durationBefore = durationOf(before);
  const durationAfter = durationOf(after);

  return {
    durationBefore,
    durationAfter,
    durationDelta: durationAfter - durationBefore,
    reorderedScenes: !sameStringArray(beforeOrder, afterOrder),
    textChanges,
    assetChanges,
    lockedFields: countDraftLocks(locks),
  };
};

export const buildAIEditPlan = (
  timeline: Timeline,
  config: MerchantConfig,
  analysis: DraftAnalysis,
  mode: AIEditMode,
  rules: GenerationRules,
  edit?: DraftEdit,
): AIEditPlan => {
  const longHeadlineCount = timeline.scenes.filter((scene) => scene.headline.length > 32).length;
  const durationPlan = buildAIDurationPlan(timeline, mode, rules, edit?.locks);
  const lockedFields = countDraftLocks(edit?.locks);
  const score = Math.max(
    0,
    Math.min(
      100,
      96 -
        analysis.blockingCount * 18 -
        analysis.warningCount * 7 -
        analysis.missingAssets * 12 -
        longHeadlineCount * 5 -
        (analysis.reviewComplete ? 0 : 6),
    ),
  );
  const suggestions: AIEditSuggestion[] = [
    {
      label: "节奏",
      detail:
        analysis.totalDuration +
        "s → 目标 " +
        durationPlan.targetDuration +
        "s；按当前规则区间自动分配分镜。",
      severity:
        Math.abs(analysis.totalDuration - durationPlan.predictedDuration) >= 3
          ? "warning"
          : "success",
    },
    {
      label: "素材",
      detail:
        analysis.missingAssets > 0
          ? analysis.missingAssets + " 个分镜需要补素材。"
          : "当前分镜均已匹配素材。",
      severity: analysis.missingAssets > 0 ? "danger" : "success",
    },
    {
      label: "钩子文案",
      detail:
        longHeadlineCount > 0
          ? longHeadlineCount + " 个画面大字偏长，会自动压短。"
          : "画面大字长度适合移动端阅读。",
      severity: longHeadlineCount > 0 ? "warning" : "success",
    },
    {
      label: "转化",
      detail: timeline.publishCopy.commentPrompt.trim()
        ? "已有评论引导；转化模式会强化 CTA。"
        : "CTA 为空，建议先补评论引导。",
      severity: timeline.publishCopy.commentPrompt.trim() ? "success" : "danger",
    },
    {
      label: "锁定保护",
      detail:
        lockedFields > 0
          ? lockedFields + " 个字段已锁定，AI 应用时不会覆盖。"
          : "没有锁定字段，AI 可完整优化当前草稿。",
      severity: lockedFields > 0 ? "info" : "success",
    },
  ];

  return {
    score,
    modeLabel: aiModeLabel[mode],
    summary:
      "按“" +
      aiModeLabel[mode] +
      "”重排分镜、优化到 " +
      durationPlan.targetDuration +
      "s 左右、压短字幕，并尽量补齐素材。",
    sceneOrder: aiSceneOrder(timeline, mode),
    suggestions,
    targetDuration: durationPlan.targetDuration,
    predictedDuration: durationPlan.predictedDuration,
    lockedFields,
  };
};

export const buildAssetPatchForDraft = ({
  draft,
  draftIndex,
  edit,
  assetList,
  assetLibrary,
}: {
  draft: Timeline;
  draftIndex: number;
  edit?: DraftEdit;
  assetList: string[];
  assetLibrary: AssetItem[];
}) => {
  const scenes: Record<string, SceneEdit> = {};

  draft.scenes.forEach((scene, sceneIndex) => {
    const assetLocked = Boolean(edit?.locks?.scenes?.[scene.id]?.asset);
    if (assetLocked || !isPlaceholderAsset(scene, assetList)) {
      return;
    }

    const asset = pickAssetForScene(scene, assetLibrary, draftIndex + sceneIndex);
    if (!asset) {
      return;
    }

    scenes[scene.id] = {
      asset: asset.path,
      assetType: asset.type,
    };
  });

  return scenes;
};

export const applyAIEdit = (draft: Timeline, patch: DraftEdit): Timeline =>
  applyDraftEdit(draft, patch);
