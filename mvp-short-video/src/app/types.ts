import type { ReactNode } from "react";
import {
  ASSET_TAGS,
  type AssetAuthorization,
  type AssetTag,
  type GenerationRules,
  type MerchantConfig,
  type ReviewState,
  type Scene,
  type SceneType,
  type TemplateId,
  type Timeline,
  type ToneId,
} from "../contract/schema.ts";
import { templateInfo } from "./timeline.ts";

export type {
  AssetAuthorization,
  AssetTag,
  GenerationRules,
  MerchantConfig,
  ReviewState,
  Scene,
  SceneType,
  TemplateId,
  Timeline,
  ToneId,
};

export type WorkspaceView =
  "drafts" | "preview" | "checks" | "aiEdit" | "merchant" | "assets" | "rules" | "export" | "diff";
export type DraftStatusFilter = "all" | "edited" | "missing" | "ready" | "review";
export type SortMode = "default" | "ready" | "duration-asc" | "duration-desc" | "title";
export type AIEditMode = "pacing" | "story" | "conversion" | "asset";
export type NavItem = { view: WorkspaceView; icon: string; label: string };
export type PublishTextField = "title" | "body" | "commentPrompt";
export type PublishLockField = PublishTextField | "hashtags";
export type SceneLockField = "type" | "headline" | "subtitle" | "duration" | "asset";
export type SceneEdit = Partial<
  Pick<
    Scene,
    | "type"
    | "duration"
    | "headline"
    | "subtitle"
    | "asset"
    | "assetType"
    | "media"
    | "subtitleSource"
  >
>;
export type AssetFileStatus = "ok" | "missing" | "unsupported" | "checking" | "unchecked";

export type DraftLocks = {
  publish?: Partial<Record<PublishLockField, boolean>>;
  scenes?: Record<string, Partial<Record<SceneLockField, boolean>>>;
};

export type DraftEdit = {
  publishCopy?: Partial<Timeline["publishCopy"]>;
  scenes?: Record<string, SceneEdit>;
  sceneOrder?: string[];
  subtitleTrack?: Timeline["subtitleTrack"];
  locks?: DraftLocks;
  updatedAt?: string;
  reviewState?: ReviewState;
  reviewedAt?: string;
  version?: number;
  sourceProposal?: import("../contract/schema.ts").DraftProposal;
  generationMeta?: import("../contract/schema.ts").GenerationMeta;
  approvedContentHash?: string;
  approvedAt?: string;
};

export type SavedVersion = {
  id: string;
  savedAt: string;
  label: string;
  timeline: Timeline;
};

export type SavedBatch = {
  id: string;
  savedAt: string;
  label: string;
  config: MerchantConfig;
  rules: GenerationRules;
  assetsText: string;
  assetTags: Record<string, AssetTag[]>;
  assetAuthorization: Record<string, AssetAuthorization>;
  draftEdits: Record<string, DraftEdit>;
  draftHistory: Record<string, SavedVersion[]>;
  draftVariants: number[];
  selectedDraftId: string;
};

export type CheckSeverity = "success" | "warning" | "danger" | "info";

export type CheckItem = {
  label: string;
  detail: string;
  severity: CheckSeverity;
  blocking?: boolean;
  target?: WorkspaceView;
};

export type DraftAnalysis = {
  checks: CheckItem[];
  matchedAssets: number;
  missingAssets: number;
  blockingCount: number;
  warningCount: number;
  totalDuration: number;
  reviewComplete: boolean;
  exportReady: boolean;
};

export type AssetItem = {
  path: string;
  type: Scene["assetType"];
  fileName: string;
  tags: AssetTag[];
  authorization: AssetAuthorization;
  status: AssetFileStatus;
  usedInAll: number;
  usedInSelected: number;
  hash?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
  imported?: boolean;
  duplicateOf?: string;
  remote?: boolean;
  transcript?: import("../contract/schema.ts").Transcript;
  sourceClip?: import("../contract/schema.ts").SourceClip;
};

export type AIEditSuggestion = {
  label: string;
  detail: string;
  severity: CheckSeverity;
};

export type AIEditPlan = {
  score: number;
  modeLabel: string;
  summary: string;
  sceneOrder: string[];
  suggestions: AIEditSuggestion[];
  targetDuration: number;
  predictedDuration: number;
  lockedFields: number;
};

export type AIEditDiff = {
  durationBefore: number;
  durationAfter: number;
  durationDelta: number;
  reorderedScenes: boolean;
  textChanges: number;
  assetChanges: number;
  lockedFields: number;
};

export type StorageNotice = {
  kind: "migrated" | "failed" | "info";
  message: string;
};

export type LLMConfig = {
  provider: "openai-compatible" | "local";
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ProjectMeta = {
  id: string;
  name: string;
  savedAt: string;
};

export type MediaJobStatus = "idle" | "running" | "done" | "failed" | "cancelled";

export type MediaJobState = {
  id: string;
  kind: "slice" | "transcribe";
  assetPath: string;
  status: MediaJobStatus;
  log: string[];
  error?: string;
  start?: number;
  duration?: number;
  translate?: boolean;
};

export type ImportedAsset = {
  file: File;
  path: string;
  hash: string;
  type: "image" | "video";
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
};

export type RenderJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type RenderJob = {
  id: string;
  createdAt: string;
  draftId: string;
  title: string;
  status: RenderJobStatus;
  command: string;
  log: string[];
  error?: string;
  outputPath?: string;
};

export const sceneLabel: Record<SceneType, string> = {
  hook: "钩子",
  pain: "痛点",
  proof: "证据",
  offer: "价值",
  cta: "转化",
};

export const sceneTypeOptions: Array<{ id: SceneType; label: string }> = [
  { id: "hook", label: "钩子" },
  { id: "pain", label: "痛点" },
  { id: "proof", label: "证据" },
  { id: "offer", label: "价值" },
  { id: "cta", label: "转化" },
];

export const assetTagOptions = [...ASSET_TAGS];

export const templateLabel = Object.fromEntries(
  templateInfo.map((template) => [template.id, template.label]),
) as Record<string, string>;

export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "资料库",
    items: [
      { view: "drafts", icon: "01", label: "全部草稿" },
      { view: "preview", icon: "02", label: "当前检查" },
      { view: "checks", icon: "03", label: "审核清单" },
      { view: "aiEdit", icon: "04", label: "AI剪辑" },
      { view: "assets", icon: "05", label: "素材库" },
    ],
  },
  {
    label: "工具",
    items: [
      { view: "merchant", icon: "06", label: "商家设置" },
      { view: "rules", icon: "07", label: "生成规则" },
      { view: "export", icon: "08", label: "导出" },
      { view: "diff", icon: "09", label: "差异对比" },
    ],
  },
];

export type StatusBadgeTone = "neutral" | "success" | "warning" | "info" | "danger";

export type FieldProps = {
  label: string;
  help?: string;
  action?: ReactNode;
  children: ReactNode;
};
