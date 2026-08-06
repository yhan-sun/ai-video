import { migrateWorkspaceRecord } from "../../contract/migration.ts";
import { WORKSPACE_SCHEMA_VERSION, type AssetMeta } from "../../contract/schema.ts";
import { normalizeAssetList, listToText, textToList } from "../format.ts";
import {
  defaultGenerationRules,
  draftIdOf,
  sampleAssets,
  sampleConfig,
  templateInfo,
  toneInfo,
} from "../timeline.ts";
import type {
  AssetAuthorization,
  AssetTag,
  DraftEdit,
  LLMConfig,
  RenderJob,
  SavedBatch,
  SavedVersion,
  StorageNotice,
  TemplateId,
  Timeline,
  ToneId,
  WorkspaceView,
} from "../types.ts";

export const STORAGE_KEY = "clips-studio-workspace-v3";
export const LEGACY_STORAGE_KEYS = ["clips-studio-workspace-v2", "clips-studio-workspace-v1"];

export type PersistedWorkspace = {
  workspaceVersion: number;
  projectId: string;
  name: string;
  industry: string;
  location: string;
  region: string;
  audience: string;
  keyword: string;
  hook: string;
  sellingPoints: string;
  painPoints: string;
  proofPoints: string;
  offer: string;
  cta: string;
  hashtags: string;
  brandStyle: string;
  assets: string;
  assetMeta: Record<string, AssetMeta>;
  assetLocalPaths: Record<string, string>;
  selectedDraftId: string;
  activeView: WorkspaceView;
  lastGenerated: string;
  generationCount: number;
  selectedTemplateIds: TemplateId[];
  tone: ToneId;
  minDuration: number;
  maxDuration: number;
  seed: number;
  draftVariants: number[];
  customDrafts: Record<string, Timeline>;
  assetTags: Record<string, AssetTag[]>;
  assetAuthorization: Record<string, AssetAuthorization>;
  draftEdits: Record<string, DraftEdit>;
  draftHistory: Record<string, SavedVersion[]>;
  editHistory: Record<string, DraftEdit[]>;
  editHistoryIndex: Record<string, number>;
  savedBatches: SavedBatch[];
  llmConfig: LLMConfig;
  renderJobs: RenderJob[];
};

export type LoadedWorkspace = {
  workspace: PersistedWorkspace;
  legacyDraftEdits?: Record<string, unknown>;
  legacyDraftHistory?: Record<string, unknown>;
  legacySelectedIndex?: number;
  notice?: StorageNotice;
};

export const defaultWorkspace: PersistedWorkspace = {
  workspaceVersion: WORKSPACE_SCHEMA_VERSION,
  projectId: "project-default",
  name: sampleConfig.name,
  industry: sampleConfig.industry,
  location: sampleConfig.location,
  region: "",
  audience: sampleConfig.audience,
  keyword: sampleConfig.keyword ?? "",
  hook: sampleConfig.hook ?? "",
  sellingPoints: listToText(sampleConfig.sellingPoints),
  painPoints: listToText(sampleConfig.painPoints),
  proofPoints: listToText(sampleConfig.proofPoints),
  offer: sampleConfig.offer ?? "",
  cta: sampleConfig.cta ?? "",
  hashtags: sampleConfig.hashtags.join(" "),
  brandStyle: "",
  assets: listToText(sampleAssets),
  assetMeta: {},
  assetLocalPaths: {},
  selectedDraftId: "",
  activeView: "drafts",
  lastGenerated: "刚刚",
  generationCount: defaultGenerationRules.count,
  selectedTemplateIds: defaultGenerationRules.templateIds,
  tone: defaultGenerationRules.tone,
  minDuration: defaultGenerationRules.minDuration,
  maxDuration: defaultGenerationRules.maxDuration,
  seed: defaultGenerationRules.seed ?? 1,
  draftVariants: Array.from({ length: defaultGenerationRules.count }, (_, index) => index),
  customDrafts: {},
  assetTags: {},
  assetAuthorization: {},
  draftEdits: {},
  draftHistory: {},
  editHistory: {},
  editHistoryIndex: {},
  savedBatches: [],
  llmConfig: { provider: "local", baseUrl: "", apiKey: "", model: "" },
  renderJobs: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textValue = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

export const numberValue = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;

const isTemplateId = (value: unknown): value is TemplateId =>
  typeof value === "string" && templateInfo.some((template) => template.id === value);

const isToneId = (value: unknown): value is ToneId =>
  typeof value === "string" && toneInfo.some((tone) => tone.id === value);

const stringArrayValue = <T extends string>(
  value: unknown,
  fallback: T[],
  guard?: (item: unknown) => item is T,
) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const next = guard
    ? value.filter(guard)
    : value.filter((item): item is T => typeof item === "string");
  return next.length > 0 ? next : fallback;
};

const assetTagsValue = (value: unknown): Record<string, AssetTag[]> => {
  if (!isRecord(value)) {
    return defaultWorkspace.assetTags;
  }

  const result: Record<string, AssetTag[]> = {};
  Object.entries(value).forEach(([key, tags]) => {
    if (Array.isArray(tags)) {
      const valid = tags.filter((tag): tag is AssetTag =>
        ["环境", "菜品", "人物", "证据", "CTA"].includes(String(tag)),
      );
      if (valid.length > 0) {
        result[key] = valid;
      }
    }
  });
  return result;
};

const assetMetaValue = (value: unknown): Record<string, AssetMeta> => {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, AssetMeta> = {};
  Object.entries(value).forEach(([key, meta]) => {
    if (isRecord(meta) && typeof meta.path === "string" && meta.path.length > 0) {
      result[key] = meta as unknown as AssetMeta;
    }
  });
  return result;
};

const assetLocalPathsValue = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  Object.entries(value).forEach(([key, path]) => {
    if (typeof path === "string" && path.length > 0) {
      result[key] = path;
    }
  });
  return result;
};

const llmConfigValue = (value: unknown): LLMConfig => {
  if (!isRecord(value)) {
    return defaultWorkspace.llmConfig;
  }

  return {
    provider: value.provider === "openai-compatible" ? "openai-compatible" : "local",
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
    model: typeof value.model === "string" ? value.model : "",
  };
};

const assetAuthorizationValue = (value: unknown): Record<string, AssetAuthorization> => {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, AssetAuthorization> = {};
  Object.entries(value).forEach(([key, auth]) => {
    if (isRecord(auth) && ["authorized", "pending", "unknown"].includes(String(auth.status))) {
      result[key] = {
        status: auth.status as AssetAuthorization["status"],
        owner: typeof auth.owner === "string" ? auth.owner : undefined,
        note: typeof auth.note === "string" ? auth.note : undefined,
      };
    }
  });
  return result;
};

const draftEditsValue = (value: unknown): Record<string, DraftEdit> =>
  isRecord(value) ? (value as Record<string, DraftEdit>) : {};

const draftHistoryValue = (value: unknown): Record<string, SavedVersion[]> =>
  isRecord(value) ? (value as Record<string, SavedVersion[]>) : {};

const savedBatchesValue = (value: unknown): SavedBatch[] =>
  Array.isArray(value) ? value.filter((batch): batch is SavedBatch => isRecord(batch)) : [];

const customDraftsValue = (value: unknown): Record<string, Timeline> => {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, Timeline> = {};
  Object.entries(value).forEach(([key, draft]) => {
    if (isRecord(draft) && Array.isArray(draft.scenes)) {
      result[key] = draft as unknown as Timeline;
    }
  });
  return result;
};

const editHistoryValue = (value: unknown): Record<string, DraftEdit[]> =>
  isRecord(value) ? (value as Record<string, DraftEdit[]>) : {};

const editHistoryIndexValue = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isInteger(entry[1]),
    ),
  );
};

const renderJobsValue = (value: unknown): RenderJob[] =>
  Array.isArray(value) ? value.filter((job): job is RenderJob => isRecord(job)) : [];

const workspaceViewValue = (value: unknown): WorkspaceView => {
  const views: WorkspaceView[] = [
    "drafts",
    "preview",
    "checks",
    "aiEdit",
    "merchant",
    "assets",
    "rules",
    "export",
    "diff",
  ];

  return typeof value === "string" && views.includes(value as WorkspaceView)
    ? (value as WorkspaceView)
    : defaultWorkspace.activeView;
};

export const ensureDraftVariants = (value: unknown, count: number) => {
  const variants = Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];
  const next = variants.slice(0, count);

  while (next.length < count) {
    next.push(next.length);
  }

  return next;
};

export const readPersistedWorkspace = (): LoadedWorkspace => {
  if (typeof window === "undefined") {
    return { workspace: defaultWorkspace };
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = window.localStorage.getItem(key);
        if (raw) {
          break;
        }
      }
    }
  } catch {
    return { workspace: defaultWorkspace };
  }

  if (!raw) {
    return { workspace: defaultWorkspace };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const migrated = migrateWorkspaceRecord(parsed, WORKSPACE_SCHEMA_VERSION);

    const record = migrated.data;
    const generationCount = numberValue(
      record.generationCount,
      defaultWorkspace.generationCount,
      1,
      20,
    );
    const selectedTemplateIds = stringArrayValue(
      record.selectedTemplateIds,
      defaultWorkspace.selectedTemplateIds,
      isTemplateId,
    );
    const tone = isToneId(record.tone) ? record.tone : defaultWorkspace.tone;
    const minDuration = numberValue(record.minDuration, defaultWorkspace.minDuration, 10, 60);
    const maxDuration = numberValue(
      record.maxDuration,
      defaultWorkspace.maxDuration,
      minDuration,
      60,
    );

    return {
      workspace: {
        workspaceVersion: WORKSPACE_SCHEMA_VERSION,
        projectId:
          typeof record.projectId === "string" && record.projectId.length > 0
            ? record.projectId
            : "project-default",
        name: textValue(record.name, defaultWorkspace.name),
        industry: textValue(record.industry, defaultWorkspace.industry),
        location: textValue(record.location, defaultWorkspace.location),
        region: textValue(record.region, ""),
        audience: textValue(record.audience, defaultWorkspace.audience),
        keyword: textValue(record.keyword, defaultWorkspace.keyword),
        hook: textValue(record.hook, defaultWorkspace.hook),
        sellingPoints: textValue(record.sellingPoints, defaultWorkspace.sellingPoints),
        painPoints: textValue(record.painPoints, defaultWorkspace.painPoints),
        proofPoints: textValue(record.proofPoints, defaultWorkspace.proofPoints),
        offer: textValue(record.offer, defaultWorkspace.offer),
        cta: textValue(record.cta, defaultWorkspace.cta),
        hashtags: textValue(record.hashtags, defaultWorkspace.hashtags),
        brandStyle: textValue(record.brandStyle, ""),
        assets: textValue(record.assets, defaultWorkspace.assets),
        assetMeta: assetMetaValue(record.assetMeta),
        assetLocalPaths: assetLocalPathsValue(record.assetLocalPaths),
        selectedDraftId: typeof record.selectedDraftId === "string" ? record.selectedDraftId : "",
        activeView: workspaceViewValue(record.activeView),
        lastGenerated: textValue(record.lastGenerated, defaultWorkspace.lastGenerated),
        generationCount,
        selectedTemplateIds,
        tone,
        minDuration,
        maxDuration,
        seed: numberValue(record.seed, 1, 1, 100000),
        draftVariants: ensureDraftVariants(record.draftVariants, generationCount),
        customDrafts: customDraftsValue(record.customDrafts),
        assetTags: assetTagsValue(record.assetTags),
        assetAuthorization: assetAuthorizationValue(record.assetAuthorization),
        draftEdits: draftEditsValue(record.draftEdits),
        draftHistory: draftHistoryValue(record.draftHistory),
        editHistory: editHistoryValue(record.editHistory),
        editHistoryIndex: editHistoryIndexValue(record.editHistoryIndex),
        savedBatches: savedBatchesValue(record.savedBatches),
        llmConfig: llmConfigValue(record.llmConfig),
        renderJobs: renderJobsValue(record.renderJobs),
      },
      legacyDraftEdits: migrated.legacyDraftEdits,
      legacyDraftHistory: migrated.legacyDraftHistory,
      legacySelectedIndex: migrated.legacySelectedIndex,
      notice:
        migrated.errors && migrated.errors.length > 0
          ? { kind: "failed", message: migrated.errors.join("；") }
          : migrated.message
            ? { kind: "migrated", message: migrated.message }
            : undefined,
    };
  } catch (error) {
    return {
      workspace: defaultWorkspace,
      notice: {
        kind: "failed",
        message:
          "本地数据迁移失败，已恢复默认工作区：" +
          (error instanceof Error ? error.message : String(error)),
      },
    };
  }
};

export const attachLegacyDraftRecords = (
  workspace: PersistedWorkspace,
  drafts: Timeline[],
  legacyDraftEdits?: Record<string, unknown>,
  legacyDraftHistory?: Record<string, unknown>,
  legacySelectedIndex?: number,
): PersistedWorkspace => {
  const next = { ...workspace };
  const nextEdits: Record<string, DraftEdit> = { ...workspace.draftEdits };
  const nextHistory: Record<string, SavedVersion[]> = { ...workspace.draftHistory };

  if (legacyDraftEdits) {
    Object.entries(legacyDraftEdits).forEach(([indexKey, edit]) => {
      const index = Number(indexKey);
      const draft = drafts[index];
      if (draft?.draftId && isRecord(edit)) {
        nextEdits[draft.draftId] = edit as DraftEdit;
      }
    });
  }

  if (legacyDraftHistory) {
    Object.entries(legacyDraftHistory).forEach(([indexKey, versions]) => {
      const index = Number(indexKey);
      const draft = drafts[index];
      if (draft?.draftId && Array.isArray(versions)) {
        nextHistory[draft.draftId] = versions as SavedVersion[];
      }
    });
  }

  if (legacySelectedIndex !== undefined && drafts[legacySelectedIndex]?.draftId) {
    next.selectedDraftId = drafts[legacySelectedIndex].draftId as string;
  }

  next.draftEdits = nextEdits;
  next.draftHistory = nextHistory;
  return next;
};

export const pruneDraftRecords = (
  edits: Record<string, DraftEdit>,
  history: Record<string, SavedVersion[]>,
  draftIds: string[],
) => {
  const idSet = new Set(draftIds);
  return {
    edits: Object.fromEntries(Object.entries(edits).filter(([id]) => idSet.has(id))),
    history: Object.fromEntries(Object.entries(history).filter(([id]) => idSet.has(id))),
  };
};

export const normalizeAssetsText = (value: string) => normalizeAssetList(textToList(value));

export const draftIdForVariant = (template: string, variant: number) =>
  draftIdOf(template, variant);

export const pruneDraftEditHistory = (
  editHistory: Record<string, DraftEdit[]>,
  editHistoryIndex: Record<string, number>,
  draftIds: string[],
) => {
  const idSet = new Set(draftIds);
  return {
    editHistory: Object.fromEntries(Object.entries(editHistory).filter(([id]) => idSet.has(id))),
    editHistoryIndex: Object.fromEntries(
      Object.entries(editHistoryIndex).filter(([id]) => idSet.has(id)),
    ),
  };
};
