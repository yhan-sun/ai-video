import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORKSPACE_SCHEMA_VERSION, type AssetMeta, type Timeline } from "../../contract/schema.ts";
import {
  createAIEditPatchForDraft,
  aiHeadlineForScene,
  aiModeLabel,
  buildAssetPatchForDraft,
  buildAIEditPlan,
  buildAIEditDiff,
  aiClampText,
} from "../ai.ts";
import {
  analyzeDraft,
  applyDraftEdit,
  createEditFromTimeline,
  createLockedEdit,
  draftHasContentEdits,
  withReviewReset,
} from "../analysis.ts";
import { buildAssetLibrary, inferAssetTags, validateAssetFiles } from "../assets.ts";
import { importFiles, importedAssetMeta } from "../importAssets.ts";
import type { AssetFileStatus } from "../types.ts";
import { createExportPayload, createRenderableTimelinePayload } from "../export.ts";
import {
  createId,
  downloadJson,
  listToText,
  nowLabel,
  tagTextToList,
  textToList,
  timelineContentHash,
} from "../format.ts";
import {
  applyMerchantConfigToWorkspace,
  merchantConfigFileName,
  parseMerchantConfig,
} from "../project.ts";
import {
  buildDrafts,
  buildDraftsDistinct,
  defaultGenerationRules,
  draftIdOf,
  sampleAssets,
  sampleConfig,
  templateForVariant,
} from "../timeline.ts";
import {
  buildAssignedSubtitlePatch,
  buildSubtitleScenePatch,
  serializeAssignments,
  type SegmentAssignment,
} from "../subtitles.ts";
import { generateProposalsWithProvider, proposalToTimeline } from "../llm.ts";
import {
  assetMetaFromImportedRecord,
  checkAssetExists as desktopCheckAssetExists,
  desktopConvertFileSrc,
  hydrateAssetLocalPaths,
  importAssetFiles as desktopImportAssetFiles,
  isDesktop,
  mediaCancel,
  mediaProbe,
  mediaSlice,
  mediaTools,
  mediaTranscribe,
  onMediaEvent,
  onRenderEvent,
  pickAssetFiles as desktopPickAssetFiles,
  previewUrlFor,
  registerAssetLocalPath,
  resolveAssetPath,
  runRenderJob as desktopRunRenderJob,
  cancelRenderJob as desktopCancelRenderJob,
  type MediaInfo,
  type MediaToolsInfo,
} from "../desktop.ts";
import { readMediaMetaFromUrl } from "../importAssets.ts";
import type {
  AIEditDiff,
  AIEditMode,
  AssetAuthorization,
  AssetItem,
  AssetTag,
  DraftEdit,
  DraftStatusFilter,
  GenerationRules,
  MediaJobState,
  MerchantConfig,
  PublishLockField,
  RenderJob,
  SavedBatch,
  SavedVersion,
  SceneEdit,
  SceneLockField,
  SortMode,
  StorageNotice,
  TemplateId,
  WorkspaceView,
} from "../types.ts";
import {
  STORAGE_KEY,
  attachLegacyDraftRecords,
  ensureDraftVariants,
  normalizeAssetsText,
  pruneDraftEditHistory,
  pruneDraftRecords,
  readPersistedWorkspace,
  type PersistedWorkspace,
} from "./workspace.ts";
import { createIndexedDBAdapter, createSQLiteAdapter, type StorageAdapter } from "./storage.ts";
import {
  browserDeleteProject,
  browserListProjects,
  browserLoadProject,
  browserSaveProject,
  buildProjectSnapshot,
} from "../projectStore.ts";
import {
  projectDeleteDesktop,
  projectListDesktop,
  projectLoadDesktop,
  projectSaveDesktop,
  type ProjectData,
  type ProjectMeta,
} from "../desktop.ts";

const initialLoad = () => {
  const loaded = readPersistedWorkspace();

  const config: MerchantConfig = {
    name: loaded.workspace.name,
    industry: loaded.workspace.industry,
    location: loaded.workspace.location,
    region: loaded.workspace.region,
    audience: loaded.workspace.audience,
    assetsDir: "public/assets",
    keyword: loaded.workspace.keyword,
    hook: loaded.workspace.hook,
    sellingPoints: textToList(loaded.workspace.sellingPoints),
    painPoints: textToList(loaded.workspace.painPoints),
    proofPoints: textToList(loaded.workspace.proofPoints),
    offer: loaded.workspace.offer,
    cta: loaded.workspace.cta,
    musicHint: "轻快旅行 / 80-100 BPM / 清爽不吵",
    hashtags: tagTextToList(loaded.workspace.hashtags),
    brandStyle: loaded.workspace.brandStyle,
  };
  const rules: GenerationRules = {
    count: loaded.workspace.generationCount,
    templateIds: loaded.workspace.selectedTemplateIds,
    tone: loaded.workspace.tone,
    minDuration: loaded.workspace.minDuration,
    maxDuration: Math.max(loaded.workspace.minDuration, loaded.workspace.maxDuration),
    seed: loaded.workspace.seed,
  };
  const assetList = normalizeAssetsText(loaded.workspace.assets);
  const variants = ensureDraftVariants(loaded.workspace.draftVariants, rules.count);
  const generatedDrafts = buildDrafts(config, assetList, rules.count, rules, variants);

  const workspace = attachLegacyDraftRecords(
    loaded.workspace,
    generatedDrafts,
    loaded.legacyDraftEdits,
    loaded.legacyDraftHistory,
    loaded.legacySelectedIndex,
  );

  const draftIds = generatedDrafts.map((draft) => draft.draftId).filter(Boolean) as string[];
  const selectedDraftId = draftIds.includes(workspace.selectedDraftId)
    ? workspace.selectedDraftId
    : (draftIds[0] ?? "");
  const pruned = pruneDraftRecords(workspace.draftEdits, workspace.draftHistory, draftIds);

  return {
    workspace: {
      ...workspace,
      draftEdits: pruned.edits,
      draftHistory: pruned.history,
      selectedDraftId,
    },
    notice: loaded.notice,
  };
};

export const useWorkspace = () => {
  const [initial] = useState(initialLoad);
  const [workspace, setWorkspace] = useState<PersistedWorkspace>(initial.workspace);
  const [notice, setNotice] = useState<StorageNotice | null>(initial.notice ?? null);
  const [activeView, setActiveView] = useState<WorkspaceView>(workspace.activeView);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [lastGenerated, setLastGenerated] = useState(workspace.lastGenerated);
  const [query, setQuery] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<DraftStatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [assetTagFilter, setAssetTagFilter] = useState<AssetTag | "all">("all");
  const [assetTargetSceneId, setAssetTargetSceneId] = useState("hook");
  const [aiEditMode, setAiEditMode] = useState<AIEditMode>("pacing");
  const [assetStatus, setAssetStatus] = useState<Record<string, AssetFileStatus>>({});
  const [assetsValidatedAt, setAssetsValidatedAt] = useState<string | null>(null);
  const [llmBusy, setLlmBusy] = useState(false);
  const llmAbortRef = useRef<AbortController | null>(null);
  const [mediaToolsInfo, setMediaToolsInfo] = useState<MediaToolsInfo | null>(null);
  const [mediaJobs, setMediaJobs] = useState<Record<string, MediaJobState>>({});
  const [probeInfo, setProbeInfo] = useState<Record<string, MediaInfo | null>>({});
  const [isWide, setIsWide] = useState<boolean | null>(
    () =>
      typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1181px)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1181px)");
    const update = () => {
      const matches = mediaQuery.matches;
      setIsWide(matches);
      if (!matches) {
        setInspectorOpen(false);
      }
    };
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
    return undefined;
  }, []);

  const persistRef = useRef(false);
  const idbRef = useRef<StorageAdapter | null>(null);

  useEffect(() => {
    try {
      idbRef.current = isDesktop() ? createSQLiteAdapter() : createIndexedDBAdapter();
    } catch {
      idbRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const adapter = idbRef.current;
    if (!adapter) {
      return undefined;
    }
    void adapter.loadWorkspace().then((loaded) => {
      if (cancelled) {
        return;
      }
      if (loaded.workspace) {
        if (loaded.workspace.workspaceVersion >= workspace.workspaceVersion) {
          setWorkspace(loaded.workspace);
          setNotice(
            loaded.notice ?? {
              kind: "info",
              message:
                adapter.id === "sqlite"
                  ? "已从本地 SQLite 数据库恢复工作区。"
                  : "已从 IndexedDB 恢复工作区（本地优先，离线可用）。",
            },
          );
        }
        return;
      }
      // 首次使用该存储：把当前工作区迁移进去（桌面端即 localStorage → SQLite）。
      void adapter.saveWorkspace(workspace).catch(() => {
        setNotice({
          kind: "failed",
          message: adapter.id + " 初始化失败，工作区仍保存在 localStorage。",
        });
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isDesktop() && workspace.assetLocalPaths) {
      hydrateAssetLocalPaths(workspace.assetLocalPaths);
    }
  }, [workspace.assetLocalPaths]);

  const config: MerchantConfig = useMemo(
    () => ({
      name: workspace.name,
      industry: workspace.industry,
      location: workspace.location,
      region: workspace.region,
      audience: workspace.audience,
      assetsDir: "public/assets",
      keyword: workspace.keyword,
      hook: workspace.hook,
      sellingPoints: textToList(workspace.sellingPoints),
      painPoints: textToList(workspace.painPoints),
      proofPoints: textToList(workspace.proofPoints),
      offer: workspace.offer,
      cta: workspace.cta,
      musicHint: "轻快旅行 / 80-100 BPM / 清爽不吵",
      hashtags: tagTextToList(workspace.hashtags),
      brandStyle: workspace.brandStyle,
    }),
    [
      workspace.audience,
      workspace.brandStyle,
      workspace.cta,
      workspace.hashtags,
      workspace.hook,
      workspace.industry,
      workspace.keyword,
      workspace.location,
      workspace.region,
      workspace.name,
      workspace.offer,
      workspace.painPoints,
      workspace.proofPoints,
      workspace.sellingPoints,
    ],
  );

  const generationRules: GenerationRules = useMemo(
    () => ({
      count: workspace.generationCount,
      templateIds: workspace.selectedTemplateIds,
      tone: workspace.tone,
      minDuration: workspace.minDuration,
      maxDuration: Math.max(workspace.minDuration, workspace.maxDuration),
      seed: workspace.seed,
    }),
    [
      workspace.generationCount,
      workspace.maxDuration,
      workspace.minDuration,
      workspace.selectedTemplateIds,
      workspace.seed,
      workspace.tone,
    ],
  );

  const assetList = useMemo(() => normalizeAssetsText(workspace.assets), [workspace.assets]);
  const draftVariantsForCount = useMemo(
    () => ensureDraftVariants(workspace.draftVariants, workspace.generationCount),
    [workspace.draftVariants, workspace.generationCount],
  );

  const generatedDrafts = useMemo(() => {
    const custom = Object.values(workspace.customDrafts);
    if (custom.length > 0) {
      return custom;
    }
    return buildDrafts(
      config,
      assetList,
      workspace.generationCount,
      generationRules,
      draftVariantsForCount,
    );
  }, [
    assetList,
    config,
    draftVariantsForCount,
    generationRules,
    workspace.customDrafts,
    workspace.generationCount,
  ]);

  const draftOrder = useMemo(
    () => generatedDrafts.map((draft) => draft.draftId).filter(Boolean) as string[],
    [generatedDrafts],
  );

  const drafts = useMemo(
    () =>
      generatedDrafts.map((draft) =>
        applyDraftEdit(draft, draft.draftId ? workspace.draftEdits[draft.draftId] : undefined),
      ),
    [generatedDrafts, workspace.draftEdits],
  );

  useEffect(() => {
    const adapter = idbRef.current;
    if (!adapter) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const sync = async () => {
        await adapter.saveWorkspace(workspace);
        await adapter.putRecord("projects", "current", {
          config,
          savedAt: new Date().toISOString(),
        });
        await adapter.putRecord("assets", "all", workspace.assetMeta);
        await adapter.putRecord("asset_authorization", "all", workspace.assetAuthorization);
        await adapter.putRecord("draft_versions", "all", workspace.draftHistory);
        await adapter.putRecord("render_jobs", "all", workspace.renderJobs);
        for (const draft of drafts) {
          if (draft.draftId && workspace.draftEdits[draft.draftId]) {
            await adapter.putRecord("drafts", draft.draftId, draft);
          }
        }
      };
      void sync().catch(() => {
        setNotice({
          kind: "failed",
          message: "IndexedDB 保存失败：工作区仍保存在 localStorage，功能不受影响。",
        });
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [config, drafts, workspace]);

  const selectedDraftId = draftOrder.includes(workspace.selectedDraftId)
    ? workspace.selectedDraftId
    : (draftOrder[0] ?? "");
  const selectedIndex = Math.max(0, draftOrder.indexOf(selectedDraftId));
  const selected = drafts[selectedIndex] ?? drafts[0];
  const selectedEdit = workspace.draftEdits[selectedDraftId];
  const selectedReviewed = selectedEdit?.reviewState === "approved";

  const selectedAnalysis = useMemo(
    () => analyzeDraft(selected, config, assetList, generationRules, selectedEdit?.reviewState),
    [assetList, config, generationRules, selected, selectedEdit?.reviewState],
  );

  const draftAnalyses = useMemo(
    () =>
      drafts.map((draft) =>
        analyzeDraft(
          draft,
          config,
          assetList,
          generationRules,
          draft.draftId ? workspace.draftEdits[draft.draftId]?.reviewState : undefined,
        ),
      ),
    [assetList, config, drafts, generationRules, workspace.draftEdits],
  );

  const selectedEdited = draftHasContentEdits(selectedEdit);

  const assetLibrary = useMemo(
    () =>
      buildAssetLibrary(
        assetList,
        drafts,
        selected,
        workspace.assetTags,
        workspace.assetAuthorization,
        assetStatus,
        workspace.assetMeta,
      ),
    [
      assetList,
      assetStatus,
      drafts,
      selected,
      workspace.assetAuthorization,
      workspace.assetMeta,
      workspace.assetTags,
    ],
  );

  const selectedAIPlan = useMemo(
    () =>
      buildAIEditPlan(
        selected,
        config,
        selectedAnalysis,
        aiEditMode,
        generationRules,
        selectedEdit,
      ),
    [aiEditMode, config, generationRules, selected, selectedAnalysis, selectedEdit],
  );

  const selectedAIEditPreview = useMemo(
    () =>
      applyDraftEdit(
        selected,
        createAIEditPatchForDraft({
          draft: selected,
          draftIndex: selectedIndex,
          mode: aiEditMode,
          edit: selectedEdit,
          config,
          assetList,
          assetLibrary,
          rules: generationRules,
        }),
      ),
    [
      aiEditMode,
      assetLibrary,
      assetList,
      config,
      generationRules,
      selected,
      selectedEdit,
      selectedIndex,
    ],
  );

  const selectedAIDiff: AIEditDiff = useMemo(
    () => buildAIEditDiff(selected, selectedAIEditPreview, selectedEdit?.locks),
    [selected, selectedAIEditPreview, selectedEdit?.locks],
  );

  const currentHistory = workspace.draftHistory[selectedDraftId] ?? [];

  const templateOptions = useMemo(
    () => Array.from(new Set(drafts.map((draft) => draft.template))),
    [drafts],
  );

  const currentTimelinePayload = useMemo(
    () =>
      createRenderableTimelinePayload({
        timeline: selected,
        config,
        rules: generationRules,
        selectedDraftId,
        assetLibrary,
      }),
    [assetLibrary, config, generationRules, selected, selectedDraftId],
  );

  const allTimelinePayload = useMemo(
    () =>
      createExportPayload({
        config,
        rules: generationRules,
        selectedDraftId,
        currentDraft: selected,
        drafts,
        assetLibrary,
      }),
    [assetLibrary, config, drafts, generationRules, selected, selectedDraftId],
  );

  const visibleDrafts = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const filtered = drafts
      .map((draft, index) => ({ draft, index, analysis: draftAnalyses[index] }))
      .filter(({ draft }) => (templateFilter === "all" ? true : draft.template === templateFilter))
      .filter(({ index, analysis }) => {
        const edit = workspace.draftEdits[drafts[index].draftId ?? ""];

        if (statusFilter === "all") {
          return true;
        }
        if (statusFilter === "edited") {
          return draftHasContentEdits(edit);
        }
        if (statusFilter === "missing") {
          return analysis.missingAssets > 0 || analysis.blockingCount > 0;
        }
        if (statusFilter === "ready") {
          return analysis.exportReady;
        }
        return !analysis.exportReady || analysis.warningCount > 0;
      })
      .filter(({ draft }) => {
        if (!lower) {
          return true;
        }

        return [
          draft.publishCopy.title,
          draft.publishCopy.body,
          draft.template,
          draft.publishCopy.commentPrompt,
          draft.publishCopy.hashtags.join(" "),
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(lower));
      });

    return filtered.sort((a, b) => {
      if (sortMode === "duration-asc") {
        return a.analysis.totalDuration - b.analysis.totalDuration;
      }
      if (sortMode === "duration-desc") {
        return b.analysis.totalDuration - a.analysis.totalDuration;
      }
      if (sortMode === "title") {
        return a.draft.publishCopy.title.localeCompare(b.draft.publishCopy.title, "zh-CN");
      }
      if (sortMode === "ready") {
        return Number(b.analysis.exportReady) - Number(a.analysis.exportReady);
      }
      return a.index - b.index;
    });
  }, [draftAnalyses, drafts, query, sortMode, statusFilter, templateFilter, workspace.draftEdits]);

  const draftStats = useMemo(
    () => ({
      edited: drafts.filter((draft) =>
        draftHasContentEdits(workspace.draftEdits[draft.draftId ?? ""]),
      ).length,
      missing: draftAnalyses.filter((analysis) => analysis.missingAssets > 0).length,
      ready: draftAnalyses.filter((analysis) => analysis.exportReady).length,
      approved: draftAnalyses.filter((analysis) => analysis.reviewComplete).length,
      review: draftAnalyses.filter((analysis) => !analysis.exportReady || analysis.warningCount > 0)
        .length,
    }),
    [draftAnalyses, drafts, workspace.draftEdits],
  );

  const updateEdit = useCallback(
    (draftId: string, updater: (edit?: DraftEdit) => DraftEdit | undefined) => {
      setWorkspace((current) => {
        const next = { ...current, draftEdits: { ...current.draftEdits } };
        const existing = current.draftEdits[draftId];
        const result = updater(existing);
        if (result) {
          next.draftEdits[draftId] = result;
        } else {
          delete next.draftEdits[draftId];
        }
        const base = current.editHistory[draftId]?.length
          ? current.editHistory[draftId]
          : [{} as DraftEdit];
        const stack = [...base, result ?? ({} as DraftEdit)].slice(-40);
        next.editHistory = { ...current.editHistory, [draftId]: stack };
        next.editHistoryIndex = { ...current.editHistoryIndex, [draftId]: stack.length - 1 };
        return next;
      });
    },
    [],
  );

  const undoSelectedEdit = useCallback(() => {
    setWorkspace((current) => {
      const stack = current.editHistory[selectedDraftId] ?? [];
      const index = current.editHistoryIndex[selectedDraftId] ?? stack.length - 1;
      if (stack.length === 0 || index <= 0) {
        return current;
      }
      const nextIndex = index - 1;
      const target = stack[nextIndex];
      const edits = { ...current.draftEdits };
      if (target && Object.keys(target).length > 0) {
        edits[selectedDraftId] = target;
      } else {
        delete edits[selectedDraftId];
      }
      return {
        ...current,
        draftEdits: edits,
        editHistoryIndex: { ...current.editHistoryIndex, [selectedDraftId]: nextIndex },
      };
    });
  }, [selectedDraftId]);

  const redoSelectedEdit = useCallback(() => {
    setWorkspace((current) => {
      const stack = current.editHistory[selectedDraftId] ?? [];
      const index = current.editHistoryIndex[selectedDraftId] ?? -1;
      if (stack.length === 0 || index >= stack.length - 1) {
        return current;
      }
      const nextIndex = index + 1;
      const target = stack[nextIndex];
      const edits = { ...current.draftEdits };
      if (target && Object.keys(target).length > 0) {
        edits[selectedDraftId] = target;
      } else {
        delete edits[selectedDraftId];
      }
      return {
        ...current,
        draftEdits: edits,
        editHistoryIndex: { ...current.editHistoryIndex, [selectedDraftId]: nextIndex },
      };
    });
  }, [selectedDraftId]);

  const canUndoSelected = useMemo(() => {
    const stack = workspace.editHistory[selectedDraftId] ?? [];
    const index = workspace.editHistoryIndex[selectedDraftId] ?? stack.length - 1;
    return stack.length > 1 && index > 0;
  }, [selectedDraftId, workspace.editHistory, workspace.editHistoryIndex]);

  const canRedoSelected = useMemo(() => {
    const stack = workspace.editHistory[selectedDraftId] ?? [];
    const index = workspace.editHistoryIndex[selectedDraftId] ?? -1;
    return stack.length > 0 && index >= 0 && index < stack.length - 1;
  }, [selectedDraftId, workspace.editHistory, workspace.editHistoryIndex]);

  const mutateSelectedEdit = useCallback(
    (updater: (edit?: DraftEdit) => DraftEdit) => {
      updateEdit(selectedDraftId, (edit) => withReviewReset(updater(edit)));
    },
    [selectedDraftId, updateEdit],
  );

  const updateSelectedPublish = useCallback(
    (field: "title" | "body" | "commentPrompt", value: string) => {
      mutateSelectedEdit((edit) => ({
        ...(edit ?? {}),
        publishCopy: { ...(edit?.publishCopy ?? {}), [field]: value },
      }));
    },
    [mutateSelectedEdit],
  );

  const updateSelectedHashtags = useCallback(
    (value: string) => {
      mutateSelectedEdit((edit) => ({
        ...(edit ?? {}),
        publishCopy: { ...(edit?.publishCopy ?? {}), hashtags: tagTextToList(value) },
      }));
    },
    [mutateSelectedEdit],
  );

  const updateSelectedScene = useCallback(
    (sceneId: string, patch: SceneEdit) => {
      mutateSelectedEdit((edit) => ({
        ...(edit ?? {}),
        scenes: {
          ...(edit?.scenes ?? {}),
          [sceneId]: { ...(edit?.scenes?.[sceneId] ?? {}), ...patch },
        },
      }));
    },
    [mutateSelectedEdit],
  );

  const moveSelectedScene = useCallback(
    (sceneId: string, direction: -1 | 1) => {
      const order = selected.scenes.map((scene) => scene.id);
      const index = order.indexOf(sceneId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
        return;
      }

      const nextOrder = [...order];
      [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];

      mutateSelectedEdit((edit) => ({ ...(edit ?? {}), sceneOrder: nextOrder }));
    },
    [mutateSelectedEdit, selected.scenes],
  );

  const toggleSelectedReview = useCallback(() => {
    updateEdit(selectedDraftId, (edit) => {
      const nextReviewed = edit?.reviewState !== "approved";
      const now = new Date().toISOString();
      return {
        ...(edit ?? {}),
        updatedAt: now,
        reviewState: nextReviewed ? "approved" : "pending",
        reviewedAt: nextReviewed ? now : undefined,
        approvedContentHash: nextReviewed ? timelineContentHash(selected) : undefined,
        approvedAt: nextReviewed ? now : undefined,
        version: (edit?.version ?? 0) + 1,
      };
    });
  }, [selected, selectedDraftId, updateEdit]);

  const toggleReviewForDraft = useCallback(
    (draftId: string, timeline: Timeline) => {
      updateEdit(draftId, (edit) => {
        const nextReviewed = edit?.reviewState !== "approved";
        const now = new Date().toISOString();
        return {
          ...(edit ?? {}),
          updatedAt: now,
          reviewState: nextReviewed ? "approved" : "pending",
          reviewedAt: nextReviewed ? now : undefined,
          approvedContentHash: nextReviewed ? timelineContentHash(timeline) : undefined,
          approvedAt: nextReviewed ? now : undefined,
          version: (edit?.version ?? 0) + 1,
        };
      });
    },
    [updateEdit],
  );

  const approveAllReadyDrafts = useCallback(() => {
    setWorkspace((current) => {
      const nextEdits = { ...current.draftEdits };
      let changed = 0;

      drafts.forEach((draft) => {
        const draftId = draft.draftId ?? "";
        if (!draftId) {
          return;
        }
        const analysis = draftAnalyses[drafts.indexOf(draft)];
        if (!analysis || analysis.blockingCount > 0) {
          return;
        }
        if (nextEdits[draftId]?.reviewState === "approved") {
          return;
        }
        const now = new Date().toISOString();
        nextEdits[draftId] = withReviewReset(nextEdits[draftId]);
        nextEdits[draftId] = {
          ...nextEdits[draftId],
          updatedAt: now,
          reviewState: "approved",
          reviewedAt: now,
          approvedContentHash: timelineContentHash(draft),
          approvedAt: now,
        };
        changed += 1;
      });

      return changed > 0 ? { ...current, draftEdits: nextEdits } : current;
    });
  }, [draftAnalyses, drafts]);

  const togglePublishLock = useCallback(
    (field: PublishLockField) => {
      mutateSelectedEdit((edit) => {
        const nextLock = !edit?.locks?.publish?.[field];
        return {
          ...(edit ?? {}),
          locks: {
            ...(edit?.locks ?? {}),
            publish: { ...(edit?.locks?.publish ?? {}), [field]: nextLock },
          },
        };
      });
    },
    [mutateSelectedEdit],
  );

  const toggleSceneLock = useCallback(
    (sceneId: string, field: SceneLockField) => {
      mutateSelectedEdit((edit) => {
        const nextLock = !edit?.locks?.scenes?.[sceneId]?.[field];
        return {
          ...(edit ?? {}),
          locks: {
            ...(edit?.locks ?? {}),
            scenes: {
              ...(edit?.locks?.scenes ?? {}),
              [sceneId]: { ...(edit?.locks?.scenes?.[sceneId] ?? {}), [field]: nextLock },
            },
          },
        };
      });
    },
    [mutateSelectedEdit],
  );

  const resetSelectedDraft = useCallback(() => {
    updateEdit(selectedDraftId, () => undefined);
  }, [selectedDraftId, updateEdit]);

  const rememberDraftBeforeAI = useCallback(
    (draftId: string, timeline: Timeline, label: string) => {
      const version: SavedVersion = {
        id: createId(),
        savedAt: new Date().toISOString(),
        label,
        timeline,
      };
      setWorkspace((current) => ({
        ...current,
        draftHistory: {
          ...current.draftHistory,
          [draftId]: [version, ...(current.draftHistory[draftId] ?? [])].slice(0, 8),
        },
      }));
    },
    [],
  );

  const applyAIEditToCurrent = useCallback(() => {
    rememberDraftBeforeAI(selectedDraftId, selected, "AI剪辑前 · " + aiModeLabel[aiEditMode]);
    updateEdit(selectedDraftId, (edit) =>
      createAIEditPatchForDraft({
        draft: selected,
        draftIndex: selectedIndex,
        mode: aiEditMode,
        edit,
        config,
        assetList,
        assetLibrary,
        rules: generationRules,
      }),
    );
    setActiveView("preview");
  }, [
    aiEditMode,
    assetLibrary,
    assetList,
    config,
    generationRules,
    rememberDraftBeforeAI,
    selected,
    selectedDraftId,
    selectedIndex,
    updateEdit,
    setActiveView,
  ]);

  const applyAIExportFixToCurrent = useCallback(() => {
    const fixMode: AIEditMode = selectedAnalysis.missingAssets > 0 ? "asset" : "conversion";
    rememberDraftBeforeAI(selectedDraftId, selected, "AI导出修复前 · " + aiModeLabel[fixMode]);
    updateEdit(selectedDraftId, (edit) =>
      createAIEditPatchForDraft({
        draft: selected,
        draftIndex: selectedIndex,
        mode: fixMode,
        edit,
        config,
        assetList,
        assetLibrary,
        rules: generationRules,
      }),
    );
    setActiveView("checks");
  }, [
    assetLibrary,
    assetList,
    config,
    generationRules,
    rememberDraftBeforeAI,
    selected,
    selectedAnalysis.missingAssets,
    selectedDraftId,
    selectedIndex,
    updateEdit,
  ]);

  const applyAIEditToAllDrafts = useCallback(() => {
    setWorkspace((current) => {
      const nextHistory = { ...current.draftHistory };
      const nextEdits = { ...current.draftEdits };
      const historyByDraft: Record<string, Timeline> = {};

      drafts.forEach((draft) => {
        const draftId = draft.draftId ?? "";
        if (!draftId) {
          return;
        }
        historyByDraft[draftId] = draft;
        const version: SavedVersion = {
          id: createId(),
          savedAt: new Date().toISOString(),
          label: "AI批量剪辑前 · " + aiModeLabel[aiEditMode],
          timeline: draft,
        };
        nextHistory[draftId] = [version, ...(nextHistory[draftId] ?? [])].slice(0, 8);
      });

      drafts.forEach((draft, index) => {
        const draftId = draft.draftId ?? "";
        if (!draftId) {
          return;
        }
        nextEdits[draftId] = createAIEditPatchForDraft({
          draft,
          draftIndex: index,
          mode: aiEditMode,
          edit: current.draftEdits[draftId],
          config,
          assetList,
          assetLibrary,
          rules: generationRules,
        });
      });

      return { ...current, draftEdits: nextEdits, draftHistory: nextHistory };
    });
    setActiveView("drafts");
  }, [aiEditMode, assetLibrary, assetList, config, drafts, generationRules]);

  const llmGenerateBatch = useCallback(async () => {
    if (llmBusy) {
      return null;
    }
    const llmConfig = workspace.llmConfig;
    setLlmBusy(true);
    const abort = new AbortController();
    llmAbortRef.current = abort;
    try {
      if (llmConfig.provider === "openai-compatible") {
        const result = await generateProposalsWithProvider({
          config,
          assets: assetList,
          rules: generationRules,
          count: workspace.generationCount,
          llmConfig,
          signal: abort.signal,
        });
        if (result.error) {
          setNotice({ kind: "failed", message: "LLM 生成失败：" + result.error });
          return result;
        }
        const seedBase = generationRules.seed ?? 1;
        const timelines = result.proposals.map((proposal, index) =>
          proposalToTimeline(
            proposal,
            config,
            assetList,
            generationRules,
            seedBase * 1000 + index,
            result.trace,
          ),
        );
        const customDrafts = Object.fromEntries(
          timelines.map((timeline) => [timeline.draftId ?? "", timeline]),
        );
        setWorkspace((current) => ({
          ...current,
          customDrafts,
          draftEdits: {},
          draftHistory: {},
          editHistory: {},
          editHistoryIndex: {},
          selectedDraftId: "",
        }));
        setNotice({
          kind: "info",
          message:
            "LLM 已生成 " +
            timelines.length +
            " 条草稿；模型 " +
            (result.trace.model || "未指定") +
            "；修复 " +
            result.trace.repairCount +
            " 次；证据不足需人工补充 " +
            (result.trace.needsHumanEvidence ? "是" : "否") +
            "。",
        });
        setActiveView("drafts");
        return result;
      }

      const { drafts: distinct } = buildDraftsDistinct(
        config,
        assetList,
        workspace.generationCount,
        generationRules,
      );
      const customDrafts = Object.fromEntries(
        distinct.map((timeline) => [timeline.draftId ?? "", timeline]),
      );
      setWorkspace((current) => ({
        ...current,
        customDrafts,
        draftEdits: {},
        draftHistory: {},
        editHistory: {},
        editHistoryIndex: {},
        selectedDraftId: "",
      }));
      setNotice({
        kind: "info",
        message:
          "本地规则生成器（离线 fallback）已生成 " +
          distinct.length +
          " 条去重草稿；" +
          "在模型设置中配置 OpenAI 兼容接口后可用 LLM 生成。",
      });
      setActiveView("drafts");
      return {
        proposals: [],
        trace: {
          provider: "local-rules",
          promptVersion: "rules-v2",
          inputHash: "",
          generatedAt: new Date().toISOString(),
          repairCount: 0,
          needsHumanEvidence: false,
        },
      };
    } finally {
      llmAbortRef.current = null;
      setLlmBusy(false);
    }
  }, [
    assetList,
    config,
    generationRules,
    llmBusy,
    setActiveView,
    setNotice,
    workspace.generationCount,
    workspace.llmConfig,
  ]);

  const llmOptimizeCurrent = useCallback(async () => {
    if (llmBusy) {
      return null;
    }
    const llmConfig = workspace.llmConfig;
    if (llmConfig.provider === "local") {
      setNotice({
        kind: "info",
        message: "请先在模型设置中配置 OpenAI 兼容接口（baseUrl + apiKey + model）。",
      });
      return null;
    }
    setLlmBusy(true);
    const abort = new AbortController();
    llmAbortRef.current = abort;
    try {
      const result = await generateProposalsWithProvider({
        config,
        assets: assetList,
        rules: generationRules,
        count: 1,
        llmConfig,
        signal: abort.signal,
      });
      if (result.error) {
        setNotice({ kind: "failed", message: "LLM 生成失败：" + result.error });
        return result;
      }
      const proposal = result.proposals[0];
      const timeline = proposalToTimeline(
        proposal,
        config,
        assetList,
        generationRules,
        selectedIndex,
        result.trace,
      );
      rememberDraftBeforeAI(
        selectedDraftId,
        selected,
        "LLM 提案前 · " + (result.trace.model ?? "model"),
      );
      updateEdit(selectedDraftId, (edit) =>
        withReviewReset({
          ...(edit ?? {}),
          publishCopy: { ...(edit?.publishCopy ?? {}), ...timeline.publishCopy },
          scenes: {
            ...(edit?.scenes ?? {}),
            ...Object.fromEntries(
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
          },
          sceneOrder: timeline.scenes.map((scene) => scene.id),
          sourceProposal: proposal,
          generationMeta: timeline.generationMeta,
        }),
      );
      setNotice({
        kind: "info",
        message:
          "模型提案已应用到当前草稿（model " +
          (result.trace.model || "未指定") +
          "，修复 " +
          result.trace.repairCount +
          " 次；需人工补充证据： " +
          (result.trace.needsHumanEvidence ? "是" : "否") +
          "）。",
      });
      setActiveView("preview");
      return result;
    } finally {
      llmAbortRef.current = null;
      setLlmBusy(false);
    }
  }, [
    assetList,
    config,
    generationRules,
    llmBusy,
    rememberDraftBeforeAI,
    selected,
    selectedDraftId,
    selectedIndex,
    setActiveView,
    setNotice,
    updateEdit,
    workspace.llmConfig,
  ]);

  const cancelLlmRequest = useCallback(() => {
    llmAbortRef.current?.abort();
    llmAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (!isDesktop()) {
      return undefined;
    }
    let cancelled = false;
    void mediaTools().then((tools) => {
      if (!cancelled) {
        setMediaToolsInfo(tools);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshMediaTools = useCallback(async () => {
    if (!isDesktop()) {
      return null;
    }
    const tools = await mediaTools();
    setMediaToolsInfo(tools);
    return tools;
  }, []);

  const probeAsset = useCallback(async (assetPath: string) => {
    if (!isDesktop()) {
      return null;
    }
    const absolute = await resolveAssetPath(assetPath);
    if (!absolute) {
      return null;
    }
    const info = await mediaProbe(absolute);
    setProbeInfo((current) => ({ ...current, [assetPath]: info }));
    return info;
  }, []);

  const registerSlicedAsset = useCallback(
    async (
      result: {
        relPath: string;
        absolutePath: string;
        thumbnailPath: string | null;
        duration: number;
      },
      originName: string,
    ) => {
      registerAssetLocalPath(result.relPath, result.absolutePath);
      const thumbnail = result.thumbnailPath
        ? await readMediaMetaFromUrl(desktopConvertFileSrc(result.thumbnailPath), "image").then(
            (meta) => meta.thumbnail,
          )
        : undefined;
      setWorkspace((current) => {
        const meta: AssetMeta = {
          path: result.relPath,
          type: "video",
          tags: ["证据"],
          hash: undefined,
          size: undefined,
          width: undefined,
          height: undefined,
          duration: result.duration,
          thumbnail,
          imported: true,
          usedInAll: 0,
          usedInSelected: 0,
          authorization: { status: "unknown", source: "本地切片" },
          sourceClip: {
            originPath: originName,
            start: 0,
            duration: result.duration,
          },
        };
        const knownPaths = new Set(
          normalizeAssetsText(current.assets).map((path) => path.replace(/^\/+/, "")),
        );
        const assetsText = knownPaths.has(result.relPath)
          ? current.assets
          : current.assets
            ? current.assets + "\n" + result.relPath
            : result.relPath;
        return {
          ...current,
          assetMeta: { ...current.assetMeta, [result.relPath]: meta },
          assetLocalPaths: { ...current.assetLocalPaths, [result.relPath]: result.absolutePath },
          assets: assetsText,
        };
      });
    },
    [],
  );

  const runMediaJob = useCallback(
    async (job: MediaJobState) => {
      if (!isDesktop()) {
        setNotice({ kind: "failed", message: "切片/转写仅在使用 Tauri 桌面端时可用。" });
        return;
      }
      const absolute = await resolveAssetPath(job.assetPath);
      if (!absolute) {
        setNotice({ kind: "failed", message: "找不到素材文件：" + job.assetPath });
        return;
      }
      setMediaJobs((current) => ({
        ...current,
        [job.id]: { ...job, status: "running", log: ["开始处理…"] },
      }));

      const unlisten = await onMediaEvent(job.id, (event) => {
        setMediaJobs((current) => {
          const existing = current[job.id];
          if (!existing) {
            return current;
          }
          if (event.type === "log") {
            return {
              ...current,
              [job.id]: { ...existing, log: [...existing.log, event.line].slice(-120) },
            };
          }
          if (event.type === "failed") {
            return {
              ...current,
              [job.id]: { ...existing, status: "failed", error: event.error },
            };
          }
          if (event.type === "done") {
            return {
              ...current,
              [job.id]: { ...existing, status: "done" },
            };
          }
          return current;
        });
      });

      try {
        if (job.kind === "slice") {
          const stem = (job.assetPath.split("/").pop() ?? "clip").replace(/\.[^.]+$/, "");
          const result = await mediaSlice({
            id: job.id,
            inputPath: absolute,
            start: job.start ?? 0,
            duration: job.duration ?? 5,
            outputName: stem + "-clip",
          });
          await registerSlicedAsset(result, stem);
          setNotice({ kind: "info", message: "切片完成：" + result.relPath });
        } else {
          const stem = (job.assetPath.split("/").pop() ?? "clip").replace(/\.[^.]+$/, "");
          const result = await mediaTranscribe({
            id: job.id,
            inputPath: absolute,
            outputName: stem,
          });
          setWorkspace((current) => {
            const meta = current.assetMeta[job.assetPath];
            if (!meta) {
              return current;
            }
            return {
              ...current,
              assetMeta: {
                ...current.assetMeta,
                [job.assetPath]: {
                  ...meta,
                  transcript: {
                    language: result.language,
                    model: result.model,
                    segments: result.segments,
                    assignments: [],
                  },
                },
              },
            };
          });
          setNotice({
            kind: "info",
            message:
              "转写完成：" +
              result.segments.length +
              " 条字幕（" +
              (result.language ?? "未知语言") +
              "）",
          });
        }
      } catch (error) {
        setMediaJobs((current) => ({
          ...current,
          [job.id]: {
            ...(current[job.id] ?? job),
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
        }));
        setNotice({
          kind: "failed",
          message: "媒体处理失败：" + (error instanceof Error ? error.message : String(error)),
        });
      } finally {
        unlisten();
      }
    },
    [registerSlicedAsset, setNotice],
  );

  const cancelMediaJob = useCallback((jobId: string) => {
    setMediaJobs((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] ?? {
          id: jobId,
          kind: "slice",
          assetPath: "",
          status: "idle" as const,
          log: [],
        }),
        status: "cancelled",
      },
    }));
    void mediaCancel(jobId).catch(() => undefined);
  }, []);

  const removeMediaJob = useCallback((jobId: string) => {
    setMediaJobs((current) => {
      const next = { ...current };
      delete next[jobId];
      return next;
    });
  }, []);

  const applyTranscriptToDraft = useCallback(
    (assetPath: string) => {
      const transcript = workspace.assetMeta[assetPath]?.transcript;
      if (!transcript || transcript.segments.length === 0) {
        setNotice({ kind: "failed", message: "该素材还没有可用字幕，请先转写。" });
        return;
      }
      const patch = buildSubtitleScenePatch(selected, transcript, assetPath);
      const sceneIds = Object.keys(patch);
      if (sceneIds.length === 0) {
        setNotice({ kind: "info", message: "字幕时间范围与当前草稿分镜没有重叠，未做填充。" });
        return;
      }

      rememberDraftBeforeAI(selectedDraftId, selected, "字幕填入分镜前 · " + assetPath);
      const skippedLocked = sceneIds.filter(
        (sceneId) => selectedEdit?.locks?.scenes?.[sceneId]?.subtitle,
      ).length;
      updateEdit(selectedDraftId, (edit) => {
        const scenes: Record<string, SceneEdit> = { ...(edit?.scenes ?? {}) };

        sceneIds.forEach((sceneId) => {
          if (edit?.locks?.scenes?.[sceneId]?.subtitle) {
            return;
          }
          scenes[sceneId] = { ...(scenes[sceneId] ?? {}), ...patch[sceneId] };
        });

        return withReviewReset({ ...(edit ?? {}), scenes });
      });
      setNotice({
        kind: "info",
        message:
          "已把素材字幕填入 " +
          (sceneIds.length - skippedLocked) +
          " 个分镜辅助文案（来源：" +
          assetPath +
          (skippedLocked > 0 ? "，锁定跳过 " + skippedLocked : "") +
          "）。",
      });
      setActiveView("preview");
    },
    [
      rememberDraftBeforeAI,
      selected,
      selectedDraftId,
      selectedEdit?.locks?.scenes,
      setActiveView,
      setNotice,
      updateEdit,
      workspace.assetMeta,
    ],
  );

  const persistTranscriptAssignments = useCallback(
    (assetPath: string, assignments: SegmentAssignment[]) => {
      setWorkspace((current) => {
        const meta = current.assetMeta[assetPath];
        if (!meta?.transcript) {
          return current;
        }
        const saved = assignments
          .filter((item) => item.sceneId !== null)
          .map((item) => ({ index: item.index, sceneId: item.sceneId }));
        return {
          ...current,
          assetMeta: {
            ...current.assetMeta,
            [assetPath]: {
              ...meta,
              transcript: { ...meta.transcript, assignments: saved },
            },
          },
        };
      });
    },
    [],
  );

  const applyTranscriptAssignments = useCallback(
    (assetPath: string, assignments: SegmentAssignment[]) => {
      const transcript = workspace.assetMeta[assetPath]?.transcript;
      if (!transcript || transcript.segments.length === 0) {
        setNotice({ kind: "failed", message: "该素材还没有可用字幕，请先转写。" });
        return;
      }
      const patch = buildAssignedSubtitlePatch(selected, transcript, assetPath, assignments);
      const sceneIds = Object.keys(patch);
      if (sceneIds.length === 0) {
        setNotice({ kind: "info", message: "没有可填入的字幕，请先指派字幕到分镜。" });
        return;
      }

      rememberDraftBeforeAI(selectedDraftId, selected, "字幕对齐填入前 · " + assetPath);
      const skippedLocked = sceneIds.filter(
        (sceneId) => selectedEdit?.locks?.scenes?.[sceneId]?.subtitle,
      ).length;
      updateEdit(selectedDraftId, (edit) => {
        const scenes: Record<string, SceneEdit> = { ...(edit?.scenes ?? {}) };

        sceneIds.forEach((sceneId) => {
          if (edit?.locks?.scenes?.[sceneId]?.subtitle) {
            return;
          }
          scenes[sceneId] = { ...(scenes[sceneId] ?? {}), ...patch[sceneId] };
        });

        return withReviewReset({ ...(edit ?? {}), scenes });
      });
      persistTranscriptAssignments(assetPath, assignments);
      setNotice({
        kind: "info",
        message:
          "已按指派对齐填入 " +
          (sceneIds.length - skippedLocked) +
          " 个分镜辅助文案（来源：" +
          assetPath +
          (skippedLocked > 0 ? "，锁定跳过 " + skippedLocked : "") +
          "）。",
      });
      setActiveView("preview");
    },
    [
      persistTranscriptAssignments,
      rememberDraftBeforeAI,
      selected,
      selectedDraftId,
      selectedEdit?.locks?.scenes,
      setActiveView,
      setNotice,
      updateEdit,
      workspace.assetMeta,
    ],
  );

  const saveTranscriptAssignments = useCallback(
    (assetPath: string, assignments: Record<number, string>) => {
      persistTranscriptAssignments(assetPath, serializeAssignments(assignments));
      setNotice({ kind: "info", message: "字幕指派已保存到素材：" + assetPath });
    },
    [persistTranscriptAssignments, setNotice],
  );

  const startSlice = useCallback(
    (assetPath: string, start: number, duration: number) => {
      const job: MediaJobState = {
        id: createId(),
        kind: "slice",
        assetPath,
        status: "idle",
        log: [],
        start,
        duration,
      };
      setMediaJobs((current) => ({ ...current, [job.id]: job }));
      void runMediaJob(job);
    },
    [runMediaJob],
  );

  const startTranscribe = useCallback(
    (assetPath: string) => {
      const job: MediaJobState = {
        id: createId(),
        kind: "transcribe",
        assetPath,
        status: "idle",
        log: [],
      };
      setMediaJobs((current) => ({ ...current, [job.id]: job }));
      void runMediaJob(job);
    },
    [runMediaJob],
  );

  const applyAIEditItem = useCallback(
    (label: string) => {
      rememberDraftBeforeAI(selectedDraftId, selected, "AI 逐项优化前 · " + label);
      let patch: DraftEdit | undefined;

      if (label === "素材") {
        const scenes = buildAssetPatchForDraft({
          draft: selected,
          draftIndex: selectedIndex,
          edit: selectedEdit,
          assetList,
          assetLibrary,
        });
        if (Object.keys(scenes).length === 0) {
          return;
        }
        patch = { ...(selectedEdit ?? {}), scenes: { ...(selectedEdit?.scenes ?? {}), ...scenes } };
      } else if (label === "钩子文案") {
        const scenePatches: Record<string, SceneEdit> = {};
        selected.scenes.forEach((scene, index) => {
          const next = aiClampText(
            aiHeadlineForScene(scene, config, "pacing", index + selectedIndex),
            32,
          );
          if (next !== scene.headline) {
            scenePatches[scene.id] = { headline: next };
          }
        });
        if (Object.keys(scenePatches).length === 0) {
          return;
        }
        patch = {
          ...(selectedEdit ?? {}),
          scenes: { ...(selectedEdit?.scenes ?? {}), ...scenePatches },
        };
      } else {
        const mode: AIEditMode = label === "转化" ? "conversion" : "pacing";
        patch = createAIEditPatchForDraft({
          draft: selected,
          draftIndex: selectedIndex,
          mode,
          edit: selectedEdit,
          config,
          assetList,
          assetLibrary,
          rules: generationRules,
        });
      }

      updateEdit(selectedDraftId, (edit) =>
        withReviewReset({
          ...(edit ?? {}),
          ...patch,
        }),
      );
      setActiveView("preview");
    },
    [
      assetLibrary,
      assetList,
      config,
      generationRules,
      rememberDraftBeforeAI,
      selected,
      selectedDraftId,
      selectedEdit,
      selectedIndex,
      setActiveView,
      updateEdit,
    ],
  );

  const autoFillSelectedAssets = useCallback(() => {
    const scenes = buildAssetPatchForDraft({
      draft: selected,
      draftIndex: selectedIndex,
      edit: selectedEdit,
      assetList,
      assetLibrary,
    });
    if (Object.keys(scenes).length === 0) {
      return;
    }

    mutateSelectedEdit((edit) => ({
      ...(edit ?? {}),
      scenes: { ...(edit?.scenes ?? {}), ...scenes },
    }));
  }, [assetLibrary, assetList, mutateSelectedEdit, selected, selectedEdit, selectedIndex]);

  const autoFillAllDraftAssets = useCallback(() => {
    setWorkspace((current) => {
      const next = { ...current, draftEdits: { ...current.draftEdits } };

      drafts.forEach((draft, draftIndex) => {
        const draftId = draft.draftId ?? "";
        if (!draftId) {
          return;
        }
        const scenes = buildAssetPatchForDraft({
          draft,
          draftIndex,
          edit: current.draftEdits[draftId],
          assetList,
          assetLibrary,
        });
        if (Object.keys(scenes).length === 0) {
          return;
        }
        next.draftEdits[draftId] = withReviewReset({
          ...(current.draftEdits[draftId] ?? {}),
          scenes: { ...(current.draftEdits[draftId]?.scenes ?? {}), ...scenes },
        });
      });

      return next;
    });
  }, [assetLibrary, assetList, drafts]);

  const regenerateAll = useCallback(() => {
    setWorkspace((current) => {
      const seed = Math.min(100000, (current.seed ?? 1) + 1);
      const variants = Array.from(
        { length: current.generationCount },
        (_, index) => seed * 1000 + index,
      );
      const pruned = pruneDraftRecords(current.draftEdits, current.draftHistory, []);
      const historyPruned = pruneDraftEditHistory(
        current.editHistory,
        current.editHistoryIndex,
        [],
      );
      return {
        ...current,
        seed,
        draftVariants: variants,
        customDrafts: {},
        draftEdits: pruned.edits,
        draftHistory: pruned.history,
        editHistory: historyPruned.editHistory,
        editHistoryIndex: historyPruned.editHistoryIndex,
        selectedDraftId: "",
      };
    });
    setLastGenerated(nowLabel());
    setActiveView("drafts");
  }, []);

  const regenerateSelectedDraft = useCallback(() => {
    const currentVariant = draftVariantsForCount[selectedIndex] ?? selectedIndex;
    const nextVariant = currentVariant + workspace.generationCount + 1;
    const lockedEdit = createLockedEdit(selected, selectedEdit?.locks);
    const nextTemplate = templateForVariant(nextVariant, generationRules);
    const nextDraftId = draftIdOf(nextTemplate, nextVariant);

    setWorkspace((current) => {
      const variants = ensureDraftVariants(current.draftVariants, current.generationCount);
      variants[selectedIndex] = nextVariant;
      const edits = { ...current.draftEdits };
      delete edits[selectedDraftId];

      if (draftHasContentEdits(lockedEdit) || lockedEdit.locks) {
        edits[nextDraftId] = lockedEdit;
      }
      return { ...current, draftVariants: variants, draftEdits: edits };
    });
    setLastGenerated(nowLabel());
  }, [
    draftVariantsForCount,
    generationRules,
    selected,
    selectedDraftId,
    selectedEdit?.locks,
    selectedIndex,
    workspace.generationCount,
  ]);

  const saveCurrentVersion = useCallback(() => {
    const version: SavedVersion = {
      id: createId(),
      savedAt: new Date().toISOString(),
      label: "草稿 " + String(selectedIndex + 1).padStart(2, "0") + " 版本",
      timeline: selected,
    };
    setWorkspace((current) => ({
      ...current,
      draftHistory: {
        ...current.draftHistory,
        [selectedDraftId]: [version, ...(current.draftHistory[selectedDraftId] ?? [])].slice(0, 8),
      },
    }));
  }, [selected, selectedDraftId, selectedIndex]);

  const restoreVersion = useCallback(
    (version: SavedVersion) => {
      updateEdit(selectedDraftId, (edit) =>
        withReviewReset(createEditFromTimeline(version.timeline, edit?.locks)),
      );
      setActiveView("preview");
    },
    [selectedDraftId, updateEdit],
  );

  const toggleAssetTag = useCallback(
    (asset: string, tag: AssetTag) => {
      const path = asset
        .replace(/^\/+/, "")
        .replace(/^public\//, "")
        .trim();
      setWorkspace((current) => {
        const existing = current.assetTags[path] ?? inferAssetTags(path);
        const nextTags = existing.includes(tag)
          ? existing.filter((item) => item !== tag)
          : [...existing, tag];
        const nextEdits = { ...current.draftEdits };
        let touched = false;

        drafts.forEach((draft) => {
          const draftId = draft.draftId ?? "";
          if (!draftId) {
            return;
          }
          const usesAsset = draft.scenes.some(
            (scene) =>
              scene.asset && scene.asset.replace(/^public\//, "").replace(/^\/+/, "") === path,
          );
          if (usesAsset && nextEdits[draftId]) {
            nextEdits[draftId] = withReviewReset(nextEdits[draftId]);
            touched = true;
          }
        });

        return {
          ...current,
          assetTags: { ...current.assetTags, [path]: nextTags },
          draftEdits: touched ? nextEdits : current.draftEdits,
        };
      });
    },
    [drafts],
  );

  const setAssetAuthorization = useCallback((asset: string, authorization: AssetAuthorization) => {
    const path = asset
      .replace(/^\/+/, "")
      .replace(/^public\//, "")
      .trim();
    setWorkspace((current) => ({
      ...current,
      assetAuthorization: { ...current.assetAuthorization, [path]: authorization },
    }));
  }, []);

  const assignAssetToTargetScene = useCallback(
    (asset: AssetItem) => {
      updateSelectedScene(assetTargetSceneId, {
        asset: asset.path,
        assetType: asset.type,
      });
      setActiveView("preview");
    },
    [assetTargetSceneId, updateSelectedScene],
  );

  const toggleTemplate = useCallback((templateId: TemplateId) => {
    setWorkspace((current) => {
      if (current.selectedTemplateIds.includes(templateId)) {
        return current.selectedTemplateIds.length === 1
          ? current
          : {
              ...current,
              selectedTemplateIds: current.selectedTemplateIds.filter(
                (item) => item !== templateId,
              ),
            };
      }
      return { ...current, selectedTemplateIds: [...current.selectedTemplateIds, templateId] };
    });
  }, []);

  const saveCurrentBatch = useCallback(() => {
    const batch: SavedBatch = {
      id: createId(),
      savedAt: new Date().toISOString(),
      label: workspace.name + " · " + nowLabel(),
      config,
      rules: generationRules,
      assetsText: workspace.assets,
      assetTags: workspace.assetTags,
      assetAuthorization: workspace.assetAuthorization,
      draftEdits: workspace.draftEdits,
      draftHistory: workspace.draftHistory,
      draftVariants: draftVariantsForCount,
      selectedDraftId,
    };
    setWorkspace((current) => ({
      ...current,
      savedBatches: [batch, ...current.savedBatches].slice(0, 6),
    }));
  }, [
    config,
    draftVariantsForCount,
    generationRules,
    selectedDraftId,
    workspace.assetAuthorization,
    workspace.assetTags,
    workspace.assets,
    workspace.draftEdits,
    workspace.draftHistory,
    workspace.name,
  ]);

  const restoreBatch = useCallback((batch: SavedBatch) => {
    setWorkspace((current) => ({
      ...current,
      name: batch.config.name,
      industry: batch.config.industry,
      location: batch.config.location,
      region: batch.config.region ?? "",
      audience: batch.config.audience,
      keyword: batch.config.keyword ?? "",
      hook: batch.config.hook ?? "",
      sellingPoints: listToText(batch.config.sellingPoints),
      painPoints: listToText(batch.config.painPoints),
      proofPoints: listToText(batch.config.proofPoints),
      offer: batch.config.offer ?? "",
      cta: batch.config.cta ?? "",
      hashtags: batch.config.hashtags.join(" "),
      brandStyle: batch.config.brandStyle ?? "",
      assets: batch.assetsText,
      generationCount: batch.rules.count,
      selectedTemplateIds: batch.rules.templateIds,
      tone: batch.rules.tone,
      minDuration: batch.rules.minDuration,
      maxDuration: batch.rules.maxDuration,
      seed: batch.rules.seed ?? current.seed,
      assetTags: batch.assetTags,
      assetAuthorization: batch.assetAuthorization,
      draftEdits: batch.draftEdits,
      draftHistory: batch.draftHistory,
      draftVariants: batch.draftVariants,
      selectedDraftId: batch.selectedDraftId,
    }));
    setLastGenerated(nowLabel());
    setActiveView("drafts");
  }, []);

  const restoreLatestBatch = useCallback(() => {
    const latest = workspace.savedBatches[0];
    if (latest) {
      restoreBatch(latest);
    }
  }, [restoreBatch, workspace.savedBatches]);

  const createRenderJobForSelected = useCallback(() => {
    const draftNumber = String(selectedIndex + 1).padStart(2, "0");
    const job: RenderJob = {
      id: createId(),
      createdAt: new Date().toISOString(),
      draftId: selectedDraftId,
      title: selected.publishCopy.title,
      status: "queued",
      command: "node scripts/render-job.mjs out/render-jobs/job-" + createId() + ".json",
      log: [
        "任务已创建（队列中）。请先下载任务文件到项目根目录的 out/render-jobs/ 下，再在终端运行上面的命令。",
        "进度、日志、取消（Ctrl+C）和错误原因会实时写入任务文件，输出位置：out/vertical-draft-" +
          draftNumber +
          ".mp4",
      ],
      outputPath: "out/vertical-draft-" + draftNumber + ".mp4",
    };
    setWorkspace((current) => ({
      ...current,
      renderJobs: [job, ...current.renderJobs].slice(0, 12),
    }));
    return job;
  }, [selected, selectedDraftId, selectedIndex]);

  const runDesktopRenderJob = useCallback(
    async (job: RenderJob) => {
      if (!isDesktop()) {
        setNotice({ kind: "failed", message: "桌面渲染仅在使用 Tauri 桌面端时可用。" });
        return;
      }
      setWorkspace((current) => ({
        ...current,
        renderJobs: current.renderJobs.map((item) =>
          item.id === job.id ? { ...item, status: "running", log: ["开始渲染…"] } : item,
        ),
      }));
      const unlisten = await onRenderEvent(job.id, (event) => {
        setWorkspace((current) => ({
          ...current,
          renderJobs: current.renderJobs.map((item) => {
            if (item.id !== job.id) {
              return item;
            }
            if (event.type === "log") {
              return {
                ...item,
                log: [...item.log, event.line].slice(-200),
                status: "running",
              };
            }
            if (event.type === "done") {
              return {
                ...item,
                status: "done",
                outputPath: event.output,
                log: [...item.log, "渲染完成，输出：" + event.output],
              };
            }
            if (event.type === "failed") {
              return {
                ...item,
                status: "failed",
                error: event.error,
                log: [...item.log, "失败：" + event.error],
              };
            }
            return {
              ...item,
              status: "cancelled",
              log: [...item.log, "任务已取消。"],
            };
          }),
        }));
      });
      try {
        const output = await desktopRunRenderJob({
          id: job.id,
          timeline: selected,
        });
        setNotice({ kind: "info", message: "桌面渲染完成，输出：" + output });
      } catch (error) {
        setNotice({
          kind: "failed",
          message: "桌面渲染失败：" + (error instanceof Error ? error.message : String(error)),
        });
      } finally {
        unlisten();
      }
    },
    [selected, setNotice],
  );

  const cancelDesktopRenderJob = useCallback(async () => {
    const cancelled = await desktopCancelRenderJob();
    if (cancelled) {
      setNotice({ kind: "info", message: "已发送取消指令，渲染进程正在退出。" });
    }
    return cancelled;
  }, [setNotice]);

  const removeRenderJob = useCallback((jobId: string) => {
    setWorkspace((current) => ({
      ...current,
      renderJobs: current.renderJobs.filter((job) => job.id !== jobId),
    }));
  }, []);

  const clearWorkspace = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      for (const key of ["clips-studio-workspace-v2", "clips-studio-workspace-v1"]) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage cleanup failures and still reset the in-memory workspace.
    }
    setWorkspace((current) => ({
      ...defaultWorkspace(),
      name: sampleConfig.name,
      industry: sampleConfig.industry,
      location: sampleConfig.location,
      audience: sampleConfig.audience,
      keyword: sampleConfig.keyword ?? "",
      hook: sampleConfig.hook ?? "",
      sellingPoints: listToText(sampleConfig.sellingPoints),
      painPoints: listToText(sampleConfig.painPoints),
      proofPoints: listToText(sampleConfig.proofPoints),
      offer: sampleConfig.offer ?? "",
      cta: sampleConfig.cta ?? "",
      hashtags: sampleConfig.hashtags.join(" "),
      assets: listToText(sampleAssets),
      selectedDraftId: "",
      activeView: current.activeView,
    }));
    setQuery("");
    setAssetQuery("");
    setTemplateFilter("all");
    setStatusFilter("all");
    setSortMode("default");
    setNotice(null);
  }, []);

  const selectDraft = useCallback(
    (index: number) => {
      const draftId = generatedDrafts[index]?.draftId ?? "";
      if (draftId) {
        setWorkspace((current) => ({ ...current, selectedDraftId: draftId }));
      }
    },
    [generatedDrafts],
  );

  const newProject = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures and still reset the in-memory workspace.
    }
    setWorkspace((current) => ({
      ...defaultWorkspace(),
      projectId: createId(),
      name: "",
      industry: "",
      location: "",
      region: "",
      audience: "",
      keyword: "",
      hook: "",
      sellingPoints: "",
      painPoints: "",
      proofPoints: "",
      offer: "",
      cta: "",
      hashtags: "",
      brandStyle: "",
      assets: "",
      activeView: current.activeView,
    }));
    setQuery("");
    setAssetQuery("");
    setNotice({ kind: "info", message: "已创建新商家项目，请先填写商家资料。" });
    setActiveView("merchant");
  }, [setActiveView, setNotice]);

  const importMerchantConfig = useCallback(
    (text: string) => {
      const result = parseMerchantConfig(text);
      if (!result.ok || !result.config) {
        setNotice({ kind: "failed", message: result.error ?? "导入商家配置失败。" });
        return result;
      }
      setWorkspace((current) => ({
        ...applyMerchantConfigToWorkspace(current, result.config as MerchantConfig),
        projectId: createId(),
      }));
      setNotice({ kind: "info", message: "已导入商家配置：" + result.config.name });
      setActiveView("merchant");
      return result;
    },
    [setActiveView, setNotice],
  );

  const downloadMerchantConfig = useCallback(() => {
    downloadJson(merchantConfigFileName(config), config);
  }, [config]);

  const saveCurrentProject = useCallback(() => {
    const project = buildProjectSnapshot({
      id: workspace.projectId || "project-default",
      name: workspace.name || "未命名商家",
      config,
      rules: generationRules,
      assetsText: workspace.assets,
      tags: workspace.assetTags,
      authorization: workspace.assetAuthorization,
    });
    if (isDesktop()) {
      const full = {
        projectId: project.id,
        draftEdits: workspace.draftEdits,
        draftHistory: workspace.draftHistory,
        assetMeta: workspace.assetMeta,
        assetLocalPaths: workspace.assetLocalPaths,
        draftVariants: workspace.draftVariants,
      };
      void projectSaveDesktop({ ...project, full })
        .then(() => {
          setNotice({ kind: "info", message: "项目已保存到本地数据库：" + project.name });
        })
        .catch((error) => {
          setNotice({
            kind: "failed",
            message: "项目保存失败：" + (error instanceof Error ? error.message : String(error)),
          });
        });
      return;
    }
    const metas = browserSaveProject(project);
    setNotice({
      kind: "info",
      message: "项目已保存（浏览器本地）：" + project.name + " · 共 " + metas.length + " 个项目",
    });
  }, [
    config,
    generationRules,
    setNotice,
    workspace.assetAuthorization,
    workspace.assetLocalPaths,
    workspace.assetMeta,
    workspace.assetTags,
    workspace.assets,
    workspace.draftEdits,
    workspace.draftHistory,
    workspace.draftVariants,
    workspace.name,
    workspace.projectId,
  ]);

  const listProjects = useCallback(async (): Promise<ProjectMeta[]> => {
    if (isDesktop()) {
      return projectListDesktop().catch(() => []);
    }
    return browserListProjects();
  }, []);

  const loadProject = useCallback(
    async (id: string) => {
      const project: ProjectData | null = isDesktop()
        ? await projectLoadDesktop(id).catch(() => null)
        : browserLoadProject(id);
      if (!project) {
        setNotice({ kind: "failed", message: "找不到该项目快照。" });
        return;
      }
      const snapshot = project as ProjectData;
      const snapshotConfig = snapshot.config as MerchantConfig;
      const snapshotRules = snapshot.rules as GenerationRules;
      const full = (snapshot.full ?? null) as {
        draftEdits?: Record<string, DraftEdit>;
        draftHistory?: Record<string, SavedVersion[]>;
        assetMeta?: Record<string, AssetMeta>;
        assetLocalPaths?: Record<string, string>;
        draftVariants?: number[];
      } | null;
      setWorkspace((current) => ({
        ...defaultWorkspace(),
        projectId: snapshot.id,
        name: snapshotConfig.name ?? "",
        industry: snapshotConfig.industry ?? "",
        location: snapshotConfig.location ?? "",
        region: snapshotConfig.region ?? "",
        audience: snapshotConfig.audience ?? "",
        keyword: snapshotConfig.keyword ?? "",
        hook: snapshotConfig.hook ?? "",
        sellingPoints: listToText(snapshotConfig.sellingPoints ?? []),
        painPoints: listToText(snapshotConfig.painPoints ?? []),
        proofPoints: listToText(snapshotConfig.proofPoints ?? []),
        offer: snapshotConfig.offer ?? "",
        cta: snapshotConfig.cta ?? "",
        hashtags: (snapshotConfig.hashtags ?? []).join(" "),
        brandStyle: snapshotConfig.brandStyle ?? "",
        assets: snapshot.assetsText ?? "",
        assetMeta: full?.assetMeta ?? {},
        assetLocalPaths: full?.assetLocalPaths ?? {},
        generationCount: snapshotRules.count ?? 10,
        selectedTemplateIds: snapshotRules.templateIds ?? defaultGenerationRules.templateIds,
        tone: snapshotRules.tone ?? defaultGenerationRules.tone,
        minDuration: snapshotRules.minDuration ?? defaultGenerationRules.minDuration,
        maxDuration: snapshotRules.maxDuration ?? defaultGenerationRules.maxDuration,
        seed: snapshotRules.seed ?? 1,
        assetTags: (snapshot.tags ?? {}) as Record<string, AssetTag[]>,
        assetAuthorization: (snapshot.authorization ?? {}) as Record<string, AssetAuthorization>,
        draftVariants: full?.draftVariants ?? [
          ...Array.from(
            { length: snapshotRules.count ?? 10 },
            (_, index) => (snapshotRules.seed ?? 1) * 1000 + index,
          ),
        ],
        draftEdits: full?.draftEdits ?? {},
        draftHistory: full?.draftHistory ?? {},
        selectedDraftId: "",
        activeView: current.activeView,
      }));
      if (full?.assetLocalPaths) {
        hydrateAssetLocalPaths(full.assetLocalPaths);
      }
      setLastGenerated(nowLabel());
      setNotice({
        kind: "info",
        message: "已切换到项目：" + snapshot.name + (full ? "（含草稿编辑与历史）" : "（配置级）"),
      });
      setActiveView("drafts");
    },
    [setActiveView, setLastGenerated, setNotice],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (isDesktop()) {
        await projectDeleteDesktop(id).catch(() => undefined);
      } else {
        browserDeleteProject(id);
      }
      setNotice({ kind: "info", message: "已删除项目快照。" });
    },
    [setNotice],
  );

  const validateAssets = useCallback(async () => {
    if (assetList.length === 0) {
      setAssetStatus({});
      setAssetsValidatedAt(null);
      return;
    }
    assetList.forEach((asset) => {
      setAssetStatus((current) => ({
        ...current,
        [asset.replace(/^\/+/, "").replace(/^public\//, "")]: "checking",
      }));
    });

    if (isDesktop()) {
      // 桌面端：真实磁盘异步校验（素材库目录 + 项目 public 目录）。
      const results: Record<string, AssetFileStatus> = {};
      await Promise.all(
        assetList.map(async (asset) => {
          const path = asset
            .trim()
            .replace(/^\/+/, "")
            .replace(/^public\//, "");
          const checked = await desktopCheckAssetExists(path);
          results[path] = checked.exists ? "ok" : "missing";
          setAssetStatus((current) => ({ ...current, [path]: results[path] }));
        }),
      );
      setAssetStatus((current) => ({ ...current, ...results }));
      setAssetsValidatedAt(nowLabel());
      return;
    }

    const results = await validateAssetFiles(assetList, (path, status) => {
      setAssetStatus((current) => ({ ...current, [path]: status }));
    });
    setAssetStatus((current) => ({ ...current, ...results }));
    setAssetsValidatedAt(nowLabel());
  }, [assetList]);

  const importAssetsDesktop = useCallback(async () => {
    if (!isDesktop()) {
      setNotice({ kind: "failed", message: "桌面导入仅在使用 Tauri 桌面端时可用。" });
      return { assets: [], duplicates: [], skipped: [] };
    }
    const paths = await desktopPickAssetFiles();
    if (!paths || paths.length === 0) {
      return { assets: [], duplicates: [], skipped: [] };
    }
    const records = await desktopImportAssetFiles(paths);
    const metas: AssetMeta[] = [];
    const localPaths: Record<string, string> = {};
    let duplicateCount = 0;

    for (const record of records) {
      if (record.duplicate) {
        duplicateCount += 1;
        continue;
      }
      const absolute = await resolveAssetPath(record.relPath);
      const meta = assetMetaFromImportedRecord(record);
      if (absolute) {
        registerAssetLocalPath(record.relPath, absolute);
        localPaths[record.relPath] = absolute;
        const type = meta.type === "video" ? "video" : "image";
        const media = await readMediaMetaFromUrl(previewUrlFor(record.relPath) ?? "", type);
        meta.width = media.width;
        meta.height = media.height;
        meta.duration = media.duration;
        meta.thumbnail = media.thumbnail;
      }
      metas.push(meta);
    }

    if (metas.length > 0) {
      setWorkspace((current) => {
        const nextMeta = { ...current.assetMeta };
        const nextLocal = { ...current.assetLocalPaths, ...localPaths };
        const knownPaths = new Set(
          normalizeAssetsText(current.assets).map((path) => path.replace(/^\/+/, "")),
        );
        const added: string[] = [];
        metas.forEach((meta) => {
          nextMeta[meta.path] = meta;
          if (!knownPaths.has(meta.path)) {
            added.push(meta.path);
          }
        });
        const assetsText = current.assets
          ? current.assets + (added.length > 0 ? "\n" + added.join("\n") : "")
          : added.join("\n");
        return { ...current, assetMeta: nextMeta, assetLocalPaths: nextLocal, assets: assetsText };
      });
    }

    setNotice({
      kind: "info",
      message:
        "桌面导入完成：" +
        metas.length +
        " 个素材" +
        (duplicateCount > 0 ? "，" + duplicateCount + " 个重复已跳过（按文件 hash）" : "") +
        "；文件已复制到本机素材库目录（仅存相对路径）。",
    });
    return { assets: metas, duplicates: [], skipped: [] };
  }, [setNotice]);

  const importAssets = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return { assets: [], duplicates: [], skipped: [] };
      }
      const result = await importFiles(files, workspace.assetMeta);
      const adapter = idbRef.current;
      if (adapter) {
        result.assets.forEach((asset) => {
          void adapter.putBlob(asset.path, asset.file).catch(() => {
            // Imported blobs are optional persistence; thumbnails remain available.
          });
        });
      }
      if (result.assets.length > 0) {
        setWorkspace((current) => {
          const nextMeta = { ...current.assetMeta };
          const knownPaths = new Set(
            normalizeAssetsText(current.assets).map((path) => path.replace(/^\/+/, "")),
          );
          const added: string[] = [];
          result.assets.forEach((asset) => {
            nextMeta[asset.path] = importedAssetMeta(asset);
            if (!knownPaths.has(asset.path)) {
              added.push(asset.path);
            }
          });
          const assetsText = current.assets
            ? current.assets + (added.length > 0 ? "\n" + added.join("\n") : "")
            : added.join("\n");
          return { ...current, assetMeta: nextMeta, assets: assetsText };
        });
      }
      const duplicateCount = result.duplicates.length;
      const skippedCount = result.skipped.length;
      setNotice({
        kind: "info",
        message:
          "导入完成：" +
          result.assets.length +
          " 个素材" +
          (duplicateCount > 0 ? "，" + duplicateCount + " 个重复已跳过（按文件 hash）" : "") +
          (skippedCount > 0 ? "，" + skippedCount + " 个格式不支持已跳过" : "") +
          "。",
      });
      return result;
    },
    [setNotice, workspace.assetMeta],
  );

  useEffect(() => {
    if (selected.scenes.some((scene) => scene.id === assetTargetSceneId)) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setAssetTargetSceneId(selected.scenes[0]?.id ?? "hook");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [assetTargetSceneId, selected.scenes]);

  const patchWorkspace = useCallback((patch: Partial<PersistedWorkspace>) => {
    setWorkspace((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    if (!persistRef.current) {
      persistRef.current = true;
      return undefined;
    }
    // 防抖持久化：避免每次击键都全量序列化工作区（含素材缩略图）并同步写 localStorage。
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...workspace, workspaceVersion: WORKSPACE_SCHEMA_VERSION }),
        );
      } catch {
        // Local storage can be unavailable in private or constrained browser contexts.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  return {
    patchWorkspace,
    workspace,
    config,
    generationRules,
    drafts,
    draftOrder,
    selected,
    selectedIndex,
    selectedDraftId,
    selectedEdit,
    selectedReviewed,
    selectedAnalysis,
    draftAnalyses,
    selectedEdited,
    selectedAIPlan,
    selectedAIEditPreview,
    selectedAIDiff,
    assetLibrary,
    assetList,
    currentHistory,
    templateOptions,
    visibleDrafts,
    draftStats,
    currentTimelinePayload,
    allTimelinePayload,
    activeView,
    setActiveView,
    inspectorOpen,
    setInspectorOpen,
    query,
    setQuery,
    assetQuery,
    setAssetQuery,
    templateFilter,
    setTemplateFilter,
    statusFilter,
    setStatusFilter,
    sortMode,
    setSortMode,
    assetTagFilter,
    setAssetTagFilter,
    assetTargetSceneId,
    setAssetTargetSceneId,
    aiEditMode,
    setAiEditMode,
    assetStatus,
    assetsValidatedAt,
    validateAssets,
    importAssets,
    importAssetsDesktop,
    isWide,
    notice,
    setNotice,
    undoSelectedEdit,
    redoSelectedEdit,
    canUndoSelected,
    canRedoSelected,
    toggleReviewForDraft,
    approveAllReadyDrafts,
    llmGenerateBatch,
    llmOptimizeCurrent,
    cancelLlmRequest,
    llmBusy,
    createRenderJobForSelected,
    runDesktopRenderJob,
    cancelDesktopRenderJob,
    removeRenderJob,
    mediaToolsInfo,
    refreshMediaTools,
    probeAsset,
    probeInfo,
    mediaJobs,
    startSlice,
    startTranscribe,
    cancelMediaJob,
    removeMediaJob,
    applyTranscriptToDraft,
    applyTranscriptAssignments,
    saveTranscriptAssignments,
    updateSelectedPublish,
    updateSelectedHashtags,
    updateSelectedScene,
    moveSelectedScene,
    toggleSelectedReview,
    togglePublishLock,
    toggleSceneLock,
    resetSelectedDraft,
    regenerateAll,
    regenerateSelectedDraft,
    applyAIEditToCurrent,
    applyAIExportFixToCurrent,
    applyAIEditToAllDrafts,
    applyAIEditItem,
    autoFillSelectedAssets,
    autoFillAllDraftAssets,
    saveCurrentVersion,
    restoreVersion,
    toggleAssetTag,
    setAssetAuthorization,
    assignAssetToTargetScene,
    toggleTemplate,
    saveCurrentBatch,
    restoreBatch,
    restoreLatestBatch,
    clearWorkspace,
    selectDraft,
    newProject,
    importMerchantConfig,
    downloadMerchantConfig,
    saveCurrentProject,
    listProjects,
    loadProject,
    deleteProject,
    setLastGenerated,
    lastGenerated,
  };
};

const defaultWorkspace = (): PersistedWorkspace => ({
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
});
