import {
  SCHEMA_VERSION,
  type GenerationRules,
  type MerchantConfig,
  type Timeline,
  TimelineSchema,
} from "../contract/schema.ts";
import { hasRemoteSceneAssets } from "./assets.ts";
import { timelineContentHash } from "./format.ts";
import type { AssetItem, DraftAnalysis, DraftEdit } from "./types.ts";

export const createExportPayload = ({
  config,
  rules,
  selectedDraftId,
  currentDraft,
  drafts,
  assetLibrary,
  kind = "current",
}: {
  config: MerchantConfig;
  rules: GenerationRules;
  selectedDraftId: string;
  currentDraft: Timeline;
  drafts?: Timeline[];
  assetLibrary: AssetItem[];
  kind?: "current" | "all" | "approved";
}) => ({
  exportedAt: new Date().toISOString(),
  product: "local-merchant-short-video-draft-workbench",
  schemaVersion: SCHEMA_VERSION,
  exportKind: kind,
  merchantConfig: config,
  generationRules: rules,
  selectedDraftId,
  assetLibrary: assetLibrary.map(toAssetMeta),
  currentDraft,
  drafts,
});

export const createRenderableTimelinePayload = ({
  timeline,
  config,
  rules,
  selectedDraftId,
  assetLibrary,
}: {
  timeline: Timeline;
  config: MerchantConfig;
  rules: GenerationRules;
  selectedDraftId: string;
  assetLibrary: AssetItem[];
}) => ({
  ...timeline,
  exportMeta: {
    exportedAt: new Date().toISOString(),
    product: "local-merchant-short-video-draft-workbench",
    schemaVersion: SCHEMA_VERSION,
    selectedDraftId,
    merchantConfig: config,
    generationRules: rules,
    assetLibrary: assetLibrary.map(toAssetMeta),
  },
});

const toAssetMeta = (asset: AssetItem) => ({
  path: asset.path,
  type: asset.type,
  tags: asset.tags,
  authorization: asset.authorization,
  usedInSelected: asset.usedInSelected,
  usedInAll: asset.usedInAll,
  hash: asset.hash,
  size: asset.size,
  width: asset.width,
  height: asset.height,
  duration: asset.duration,
  imported: asset.imported,
  duplicateOf: asset.duplicateOf,
  remote: asset.remote,
});

export const exportGate = (
  timeline: Timeline,
  analysis: DraftAnalysis,
  edit?: DraftEdit,
): { ok: boolean; reasons: string[] } => {
  const reasons: string[] = [];

  if (!edit || edit.reviewState !== "approved") {
    reasons.push("尚未人工审核通过（需确认素材授权、优惠有效性和平台合规）");
  }

  if (analysis.blockingCount > 0) {
    reasons.push(analysis.blockingCount + " 项阻断检查未通过");
  }

  if (analysis.missingAssets > 0) {
    reasons.push(analysis.missingAssets + " 个分镜缺素材或使用占位");
  }

  if (hasRemoteSceneAssets(timeline)) {
    reasons.push("草稿引用了远程 URL 素材，默认禁止导出（只允许本机相对路径素材）");
  }

  if (timeline.sourceProposal?.needsHumanEvidence || timeline.generationMeta?.needsHumanEvidence) {
    reasons.push("生成结果标记 needsHumanEvidence，需人工补充证据后重新审核");
  }

  const parsed = TimelineSchema.safeParse(timeline);
  if (!parsed.success) {
    reasons.push("草稿未通过数据契约校验（schema）");
  }

  return { ok: reasons.length === 0, reasons };
};

export type DraftExportStatus = "approved" | "pending" | "edited";

export const draftExportStatus = (edit?: DraftEdit): DraftExportStatus => {
  if (edit?.reviewState === "approved") {
    return "approved";
  }
  if (edit && Object.keys(edit).length > 0) {
    return "edited";
  }
  return "pending";
};

export const createExportPackage = ({
  kind,
  config,
  rules,
  drafts,
  assetLibrary,
  edits,
}: {
  kind: "current" | "all" | "approved";
  config: MerchantConfig;
  rules: GenerationRules;
  drafts: Timeline[];
  assetLibrary: AssetItem[];
  edits: Record<string, DraftEdit>;
}) => {
  const selected = kind === "current" ? drafts.slice(0, 1) : drafts;
  const exported = selected.filter((draft) => {
    const status = draftExportStatus(edits[draft.draftId ?? ""]);
    return kind === "approved" ? status === "approved" : true;
  });

  const reviewMeta: Record<
    string,
    {
      reviewState: "approved" | "pending";
      reviewedAt?: string;
      approvedContentHash?: string;
      approvedAt?: string;
      status: DraftExportStatus;
    }
  > = {};

  drafts.forEach((draft) => {
    const id = draft.draftId ?? "";
    if (!id) {
      return;
    }
    const edit = edits[id];
    const status = draftExportStatus(edit);
    reviewMeta[id] = {
      reviewState: status === "approved" ? "approved" : "pending",
      reviewedAt: edit?.reviewedAt,
      approvedContentHash: edit?.approvedContentHash,
      approvedAt: edit?.approvedAt,
      status,
    };
  });

  return {
    exportedAt: new Date().toISOString(),
    product: "local-merchant-short-video-draft-workbench",
    schemaVersion: SCHEMA_VERSION,
    kind,
    merchantConfig: config,
    generationRules: rules,
    assetManifest: assetLibrary.map(toAssetMeta),
    reviewMeta,
    drafts: exported,
  };
};

export const approvedContentHashOf = (timeline: Timeline) => timelineContentHash(timeline);
