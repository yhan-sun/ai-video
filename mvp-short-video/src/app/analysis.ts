import {
  type GenerationRules,
  type MerchantConfig,
  type ReviewState,
  type Scene,
  type Timeline,
} from "../contract/schema.ts";
import { assetMatches, hasRemoteSceneAssets, isPlaceholderAsset } from "./assets.ts";
import { durationOf } from "./format.ts";
import { sceneLabel } from "./types.ts";
import type { CheckItem, DraftAnalysis, DraftEdit, DraftLocks, SceneEdit } from "./types.ts";

export const applyDraftEdit = (draft: Timeline, edit?: DraftEdit): Timeline => {
  if (!edit) {
    return draft;
  }

  const editedScenes = draft.scenes.map((scene) => {
    const sceneEdit = edit.scenes?.[scene.id] ?? {};
    const hasSubtitleEdit = "subtitle" in sceneEdit;
    // 手动编辑字幕（未同时提供字幕来源）时，自动清除来源标记，避免来源与文案脱节。
    const cleared =
      hasSubtitleEdit && !("subtitleSource" in sceneEdit) ? { subtitleSource: undefined } : {};
    return { ...scene, ...sceneEdit, ...cleared };
  });
  const order = edit.sceneOrder?.filter((sceneId) =>
    editedScenes.some((scene) => scene.id === sceneId),
  );
  const orderedScenes = order?.length
    ? ([
        ...order
          .map((sceneId) => editedScenes.find((scene) => scene.id === sceneId))
          .filter(Boolean),
        ...editedScenes.filter((scene) => !order.includes(scene.id)),
      ] as Scene[])
    : editedScenes;

  return {
    ...draft,
    scenes: orderedScenes,
    publishCopy: {
      ...draft.publishCopy,
      ...(edit.publishCopy ?? {}),
    },
    reviewState: edit.reviewState ?? draft.reviewState,
    reviewedAt: edit.reviewedAt,
    updatedAt: edit.updatedAt,
    subtitleTrack: edit.subtitleTrack ?? draft.subtitleTrack,
    sourceProposal: edit.sourceProposal ?? draft.sourceProposal,
    generationMeta: edit.generationMeta ?? draft.generationMeta,
  };
};

export const draftHasContentEdits = (edit?: DraftEdit) =>
  Boolean(edit?.publishCopy && Object.keys(edit.publishCopy).length > 0) ||
  Boolean(edit?.scenes && Object.keys(edit.scenes).length > 0) ||
  Boolean(edit?.sceneOrder?.length);

export const hasLocks = (locks?: DraftLocks) =>
  Boolean(locks?.publish && Object.values(locks.publish).some(Boolean)) ||
  Boolean(
    locks?.scenes &&
    Object.values(locks.scenes).some((sceneLocks) => Object.values(sceneLocks).some(Boolean)),
  );

export const countDraftLocks = (locks?: DraftLocks) => {
  const publishLocks = locks?.publish ? Object.values(locks.publish).filter(Boolean).length : 0;
  const sceneLocks = locks?.scenes
    ? Object.values(locks.scenes).reduce(
        (total, sceneLocks) => total + Object.values(sceneLocks).filter(Boolean).length,
        0,
      )
    : 0;

  return publishLocks + sceneLocks;
};

export const withReviewReset = (edit?: DraftEdit): DraftEdit => ({
  ...edit,
  updatedAt: new Date().toISOString(),
  reviewState: "pending",
  reviewedAt: undefined,
  approvedContentHash: undefined,
  approvedAt: undefined,
  version: (edit?.version ?? 0) + 1,
});

export const createEditFromTimeline = (timeline: Timeline, locks?: DraftLocks): DraftEdit => ({
  locks,
  updatedAt: new Date().toISOString(),
  sceneOrder: timeline.scenes.map((scene) => scene.id),
  publishCopy: {
    title: timeline.publishCopy.title,
    body: timeline.publishCopy.body,
    hashtags: timeline.publishCopy.hashtags,
    commentPrompt: timeline.publishCopy.commentPrompt,
  },
  scenes: Object.fromEntries(
    timeline.scenes.map((scene) => [
      scene.id,
      {
        type: scene.type,
        headline: scene.headline,
        subtitle: scene.subtitle,
        duration: scene.duration,
        asset: scene.asset,
        assetType: scene.assetType,
      },
    ]),
  ),
});

export const createLockedEdit = (current: Timeline, locks?: DraftLocks): DraftEdit => {
  const edit: DraftEdit = {
    locks,
    updatedAt: new Date().toISOString(),
  };

  if (locks?.publish) {
    const publishCopy: Partial<Timeline["publishCopy"]> = {};
    (["title", "body", "commentPrompt", "hashtags"] as const).forEach((field) => {
      if (locks.publish?.[field]) {
        publishCopy[field] = current.publishCopy[field] as never;
      }
    });

    if (Object.keys(publishCopy).length > 0) {
      edit.publishCopy = publishCopy;
    }
  }

  if (locks?.scenes) {
    const scenes: Record<string, SceneEdit> = {};

    current.scenes.forEach((scene) => {
      const sceneLocks = locks.scenes?.[scene.id];
      if (!sceneLocks) {
        return;
      }

      const sceneEdit: SceneEdit = {};
      (["type", "headline", "subtitle", "duration", "asset"] as const).forEach((field) => {
        if (sceneLocks[field]) {
          if (field === "asset") {
            sceneEdit.asset = scene.asset;
            sceneEdit.assetType = scene.assetType;
          } else {
            sceneEdit[field] = scene[field] as never;
          }
        }
      });

      if (Object.keys(sceneEdit).length > 0) {
        scenes[scene.id] = sceneEdit;
      }
    });

    if (Object.keys(scenes).length > 0) {
      edit.scenes = scenes;
    }
  }

  return edit;
};

export const analyzeDraft = (
  timeline: Timeline,
  config: MerchantConfig,
  availableAssets: string[],
  rules: GenerationRules,
  reviewState: ReviewState = "pending",
): DraftAnalysis => {
  const totalDuration = durationOf(timeline);
  const matchedAssets = assetMatches(timeline, availableAssets);
  const missingAssetScenes = timeline.scenes.filter((scene) =>
    isPlaceholderAsset(scene, availableAssets),
  );
  const emptyHeadlineScenes = timeline.scenes.filter((scene) => !scene.headline.trim());
  const emptySubtitleScenes = timeline.scenes.filter((scene) => !(scene.subtitle ?? "").trim());
  const missingSourceScenes = timeline.scenes.filter((scene) => {
    if (!scene.subtitleSource) {
      return false;
    }
    const source = scene.subtitleSource.asset.replace(/^\/+/, "").replace(/^public\//, "");
    const available = new Set(
      availableAssets.map((asset) => asset.replace(/^\/+/, "").replace(/^public\//, "")),
    );
    return !available.has(source);
  });
  const invalidDurationScenes = timeline.scenes.filter(
    (scene) => !Number.isFinite(scene.duration) || scene.duration < 1 || scene.duration > 10,
  );
  const checks: CheckItem[] = [
    {
      label: "商家资料",
      detail:
        config.name && config.industry && config.location && config.audience
          ? "名称、行业、区域、人群已填写"
          : "商家资料缺名称、行业、区域或目标人群",
      severity:
        config.name && config.industry && config.location && config.audience ? "success" : "danger",
      blocking: !(config.name && config.industry && config.location && config.audience),
      target: "merchant",
    },
    {
      label: "素材覆盖",
      detail:
        missingAssetScenes.length === 0
          ? matchedAssets + "/" + timeline.scenes.length + " 个场景命中素材"
          : missingAssetScenes.map((scene) => sceneLabel[scene.type]).join("、") +
            " 缺素材或使用占位",
      severity: missingAssetScenes.length === 0 ? "success" : "danger",
      blocking: missingAssetScenes.length > 0,
      target: "assets",
    },
    {
      label: "远程素材",
      detail: hasRemoteSceneAssets(timeline)
        ? "草稿使用了远程 URL 素材，默认禁止导出（只允许本机相对路径素材）"
        : "全部素材均为本机相对路径",
      severity: hasRemoteSceneAssets(timeline) ? "danger" : "success",
      blocking: hasRemoteSceneAssets(timeline),
      target: "assets",
    },
    {
      label: "证据完整性",
      detail:
        timeline.sourceProposal?.needsHumanEvidence || timeline.generationMeta?.needsHumanEvidence
          ? "生成时已标记证据不足（needsHumanEvidence），需人工补充价格、优惠、销量、评价或距离等事实后再审核"
          : "生成结果未要求额外人工证据补充",
      severity:
        timeline.sourceProposal?.needsHumanEvidence || timeline.generationMeta?.needsHumanEvidence
          ? "danger"
          : "success",
      blocking:
        Boolean(timeline.sourceProposal?.needsHumanEvidence) ||
        Boolean(timeline.generationMeta?.needsHumanEvidence),
      target: "aiEdit",
    },
    {
      label: "标题长度",
      detail: timeline.publishCopy.title.trim()
        ? timeline.publishCopy.title.length + " 字，建议控制在 34 字以内"
        : "发布标题为空",
      severity: !timeline.publishCopy.title.trim()
        ? "danger"
        : timeline.publishCopy.title.length > 34
          ? "warning"
          : "success",
      blocking: !timeline.publishCopy.title.trim(),
      target: "preview",
    },
    {
      label: "发布正文",
      detail: timeline.publishCopy.body.trim()
        ? "发布正文已填写，导出前可再人工润色"
        : "发布正文为空",
      severity: timeline.publishCopy.body.trim() ? "success" : "danger",
      blocking: !timeline.publishCopy.body.trim(),
      target: "preview",
    },
    {
      label: "CTA",
      detail:
        timeline.publishCopy.commentPrompt.trim() || timeline.scenes.at(-1)?.headline.trim()
          ? "CTA / 评论引导已存在"
          : "CTA 为空，无法形成转化路径",
      severity:
        timeline.publishCopy.commentPrompt.trim() || timeline.scenes.at(-1)?.headline.trim()
          ? "success"
          : "danger",
      blocking: !(
        timeline.publishCopy.commentPrompt.trim() || timeline.scenes.at(-1)?.headline.trim()
      ),
      target: "preview",
    },
    {
      label: "分镜文案",
      detail:
        emptyHeadlineScenes.length === 0
          ? emptySubtitleScenes.length === 0
            ? "每个分镜都有画面大字和辅助文案"
            : emptySubtitleScenes.map((scene) => sceneLabel[scene.type]).join("、") + " 缺辅助文案"
          : emptyHeadlineScenes.map((scene) => sceneLabel[scene.type]).join("、") + " 缺画面大字",
      severity:
        emptyHeadlineScenes.length > 0
          ? "danger"
          : emptySubtitleScenes.length > 0
            ? "warning"
            : "success",
      blocking: emptyHeadlineScenes.length > 0,
      target: "preview",
    },
    {
      label: "文案来源",
      detail: (() => {
        const sourced = timeline.scenes.filter((scene) => scene.subtitleSource);
        if (sourced.length === 0) {
          return "辅助文案无素材转写来源（可人工撰写）";
        }
        return (
          sourced.map((scene) => sceneLabel[scene.type]).join("、") +
          " 辅助文案来自素材转写（人工审核时请核对与画面一致性）"
        );
      })(),
      severity:
        timeline.scenes.filter((scene) => scene.subtitleSource).length > 0 ? "info" : "success",
      target: "assets",
    },
    {
      label: "字幕来源素材",
      detail:
        missingSourceScenes.length === 0
          ? "字幕来源素材均存在于素材库"
          : missingSourceScenes.map((scene) => sceneLabel[scene.type]).join("、") +
            " 的字幕来源素材不在素材库（可能已删除），导出前请核对",
      severity: missingSourceScenes.length > 0 ? "warning" : "success",
      target: "assets",
    },
    {
      label: "视频时长",
      detail:
        totalDuration >= rules.minDuration && totalDuration <= rules.maxDuration
          ? totalDuration + "s，落在当前规则区间"
          : totalDuration +
            "s，当前规则区间为 " +
            rules.minDuration +
            "-" +
            rules.maxDuration +
            "s",
      severity:
        totalDuration >= rules.minDuration && totalDuration <= rules.maxDuration
          ? "success"
          : "warning",
      target: "rules",
    },
    {
      label: "场景时长",
      detail:
        invalidDurationScenes.length === 0
          ? "单个分镜时长均在 1-10s"
          : invalidDurationScenes.map((scene) => sceneLabel[scene.type]).join("、") + " 时长异常",
      severity: invalidDurationScenes.length === 0 ? "success" : "danger",
      blocking: invalidDurationScenes.length > 0,
      target: "preview",
    },
    {
      label: "话题标签",
      detail:
        timeline.publishCopy.hashtags.length > 0
          ? timeline.publishCopy.hashtags.join(" ")
          : "话题标签为空",
      severity: timeline.publishCopy.hashtags.length > 0 ? "success" : "warning",
      target: "merchant",
    },
    {
      label: "人工审核",
      detail:
        reviewState === "approved"
          ? "已人工确认素材授权、优惠有效性和平台合规"
          : "导出前仍需确认素材授权、优惠有效性和平台合规",
      severity: reviewState === "approved" ? "success" : "info",
    },
  ];
  const blockingCount = checks.filter((check) => check.blocking).length;
  const warningCount = checks.filter((check) => check.severity === "warning").length;
  const reviewComplete = reviewState === "approved";

  return {
    checks,
    matchedAssets,
    missingAssets: missingAssetScenes.length,
    blockingCount,
    warningCount,
    totalDuration,
    reviewComplete,
    exportReady: blockingCount === 0 && reviewComplete,
  };
};
