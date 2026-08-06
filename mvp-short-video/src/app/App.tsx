import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "./state/useWorkspace.ts";
import { createExportPackage, exportGate } from "./export.ts";
import { createDraftJson, downloadTextFile } from "./format.ts";
import { isDesktop, saveOrDownload } from "./desktop.ts";
import { WindowChrome } from "./components/WindowChrome.tsx";
import { navGroups, type WorkspaceView } from "./types.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Topbar, StatusStrip, MigrationNotice } from "./components/Topbar.tsx";
import { DraftListPanel } from "./components/DraftList.tsx";
import { DraftDiffPanel } from "./components/DraftDiff.tsx";
import { DraftInspector } from "./components/Inspector.tsx";
import { CheckListPanel } from "./components/CheckList.tsx";
import { AssetLibraryPanel } from "./components/AssetLibrary.tsx";
import { AIEditPanel } from "./components/AIEdit.tsx";
import { ExportRunbook } from "./components/ExportRunbook.tsx";
import { BatchCheckPanel, MerchantSettingsPanel, RulesPanel } from "./components/Settings.tsx";
import type { MerchantField } from "./components/Settings.tsx";
import type { ProjectMeta, SceneEdit, ToneId } from "./types.ts";
import type { Timeline } from "./types.ts";

export const App = () => {
  const workspace = useWorkspace();
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [forceExport, setForceExport] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [diffIndexes, setDiffIndexes] = useState<number[]>([0, 1]);

  const refreshProjects = useCallback(() => {
    void workspace.listProjects().then((list) => setProjects(list));
  }, [workspace]);

  const {
    config,
    generationRules,
    drafts,
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
    assetsValidatedAt,
    validateAssets,
    isWide,
    notice,
    setNotice,
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
    lastGenerated,
    workspace: rawWorkspace,
  } = workspace;

  const showInspector =
    (activeView === "drafts" || activeView === "preview") &&
    drafts.length > 0 &&
    (isWide === true || inspectorOpen);

  const selectedGate = useMemo(
    () => exportGate(selected, selectedAnalysis, selectedEdit),
    [selected, selectedAnalysis, selectedEdit],
  );
  const allDraftsApproved = useMemo(
    () =>
      drafts.every((draft) => {
        const edit = rawWorkspace.draftEdits[draft.draftId ?? ""];
        return (edit?.reviewState ?? draft.reviewState) === "approved";
      }),
    [drafts, rawWorkspace.draftEdits],
  );
  const gate = forceExport
    ? { ok: true, reasons: [] as string[] }
    : {
        ok: selectedGate.ok && allDraftsApproved,
        reasons: [
          ...selectedGate.reasons,
          ...(allDraftsApproved ? [] : ["部分草稿尚未通过人工审核"]),
        ],
      };

  const copyJsonPayload = async (payload: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(createDraftJson(payload));
      setCopiedCommand(label);
      window.setTimeout(() => setCopiedCommand(null), 1500);
    } catch {
      setCopiedCommand(null);
    }
  };

  const copyCommand = async (command: string, label: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(label);
      window.setTimeout(() => setCopiedCommand(null), 1500);
    } catch {
      setCopiedCommand(null);
    }
  };

  const downloadCurrent = async () => {
    const saved = await saveOrDownload(
      "timeline-" + String(selectedIndex + 1).padStart(2, "0") + ".json",
      createDraftJson(currentTimelinePayload),
      downloadTextFile,
    );
    if (saved) {
      setNotice({ kind: "info", message: "已导出当前草稿：" + saved });
    }
  };

  const downloadAll = async () => {
    const saved = await saveOrDownload(
      "all-timelines.json",
      createDraftJson(allTimelinePayload),
      downloadTextFile,
    );
    if (saved) {
      setNotice({ kind: "info", message: "已导出全部草稿：" + saved });
    }
  };

  const downloadApproved = async () => {
    const saved = await saveOrDownload(
      "approved-timelines.json",
      createDraftJson(
        createExportPackage({
          kind: "approved",
          config,
          rules: generationRules,
          drafts,
          assetLibrary,
          edits: rawWorkspace.draftEdits,
        }),
      ),
      downloadTextFile,
    );
    if (saved) {
      setNotice({ kind: "info", message: "已导出仅已审核草稿包：" + saved });
    }
  };

  const forceDownload = () => {
    setForceExport(true);
    window.setTimeout(() => void downloadCurrent(), 0);
  };

  const focusIssue = (check: { target?: WorkspaceView }) => {
    setActiveView(check.target ?? "preview");
  };

  const merchantFields = {
    name: rawWorkspace.name,
    industry: rawWorkspace.industry,
    location: rawWorkspace.location,
    region: rawWorkspace.region,
    audience: rawWorkspace.audience,
    keyword: rawWorkspace.keyword,
    hook: rawWorkspace.hook,
    sellingPoints: rawWorkspace.sellingPoints,
    painPoints: rawWorkspace.painPoints,
    proofPoints: rawWorkspace.proofPoints,
    offer: rawWorkspace.offer,
    cta: rawWorkspace.cta,
    hashtags: rawWorkspace.hashtags,
    brandStyle: rawWorkspace.brandStyle,
  };

  const setMerchantField = (field: MerchantField, value: string) => {
    workspace.patchWorkspace({ [field]: value } as never);
  };

  const setGenerationField = (
    field: "count" | "minDuration" | "maxDuration" | "tone",
    value: number | ToneId,
  ) => {
    workspace.patchWorkspace({ [field]: value } as never);
  };

  const activeNavItem = navGroups
    .flatMap((group) => group.items)
    .find((item) => item.view === activeView);

  // 键盘监听通过 ref 固定 handler，避免每次工作区变化（如击键）都移除/重挂全局监听。
  const keyboardStateRef = useRef({
    activeView,
    saveCurrentVersion,
    toggleSelectedReview,
    workspace,
  });
  useEffect(() => {
    keyboardStateRef.current = { activeView, saveCurrentVersion, toggleSelectedReview, workspace };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = keyboardStateRef.current;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);
      const mod = event.metaKey || event.ctrlKey;
      const focusSearch = () => {
        const search = document.getElementById("global-search");
        if (search) {
          (search as HTMLInputElement).focus();
        }
      };

      if (event.key === "Escape" && !isTyping) {
        setInspectorOpen(false);
        return;
      }
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        state.saveCurrentVersion();
        return;
      }
      if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        if (state.activeView === "drafts" || state.activeView === "preview") {
          state.workspace.undoSelectedEdit();
        }
        return;
      }
      if (
        (mod && event.shiftKey && event.key.toLowerCase() === "z") ||
        (mod && event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        if (state.activeView === "drafts" || state.activeView === "preview") {
          state.workspace.redoSelectedEdit();
        }
        return;
      }
      if (mod && event.key === "Enter") {
        event.preventDefault();
        state.toggleSelectedReview();
        return;
      }
      if (!isTyping && event.key === "/") {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const centerView = (() => {
    switch (activeView) {
      case "preview":
      case "drafts":
        return (
          <DraftListPanel
            drafts={drafts}
            selectedIndex={selectedIndex}
            selectedAnalysis={selectedAnalysis}
            visibleDrafts={visibleDrafts}
            draftStats={draftStats}
            lastGenerated={lastGenerated}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortMode={sortMode}
            setSortMode={setSortMode}
            templateFilter={templateFilter}
            setTemplateFilter={setTemplateFilter}
            templateOptions={templateOptions}
            draftEdits={rawWorkspace.draftEdits}
            onSelectDraft={selectDraft}
            onOpenInspector={() => setInspectorOpen(true)}
            onDownloadCurrent={downloadCurrent}
            onDownloadAll={downloadAll}
          />
        );
      case "checks":
        return (
          <div className="checksGrid">
            <article className="panel opsPanel">
              <CheckListPanel
                analysis={selectedAnalysis}
                title="当前草稿审核清单"
                onIssueAction={focusIssue}
              />
            </article>
            <article className="panel opsPanel">
              <BatchCheckPanel
                drafts={drafts}
                draftAnalyses={draftAnalyses}
                selectedIndex={selectedIndex}
                onSelectDraft={(index) => {
                  selectDraft(index);
                  setActiveView("preview");
                }}
                onApproveAllReady={workspace.approveAllReadyDrafts}
                onCompare={(index) => {
                  setDiffIndexes([index, (index + 1) % drafts.length]);
                  setActiveView("diff");
                }}
              />
            </article>
          </div>
        );
      case "aiEdit":
        return (
          <AIEditPanel
            selected={selected}
            selectedIndex={selectedIndex}
            analysis={selectedAnalysis}
            mode={aiEditMode}
            plan={selectedAIPlan}
            previewTimeline={selectedAIEditPreview}
            diff={selectedAIDiff}
            onSetMode={setAiEditMode}
            onApplyCurrent={applyAIEditToCurrent}
            onFixExport={applyAIExportFixToCurrent}
            onApplyAll={applyAIEditToAllDrafts}
            onApplyItem={workspace.applyAIEditItem}
            onLLMGenerateAll={() => void workspace.llmGenerateBatch()}
            onLLMOptimizeCurrent={() => void workspace.llmOptimizeCurrent()}
            onCancelLlm={workspace.cancelLlmRequest}
            llmConfigured={rawWorkspace.llmConfig.provider === "openai-compatible"}
            llmBusy={workspace.llmBusy}
            onGoPreview={() => setActiveView("preview")}
          />
        );
      case "merchant":
        return (
          <MerchantSettingsPanel
            fields={merchantFields}
            assetsText={rawWorkspace.assets}
            setAssetsText={(value) => workspace.patchWorkspace({ assets: value })}
            onChange={setMerchantField}
            onNewProject={() => {
              if (
                window.confirm("创建新商家项目会清空当前工作区（草稿、编辑和批次）。确定继续？")
              ) {
                workspace.newProject();
              }
            }}
            onImportConfig={(text) => void workspace.importMerchantConfig(text)}
            onExportConfig={workspace.downloadMerchantConfig}
            projects={projects}
            currentProjectId={rawWorkspace.projectId}
            onRefreshProjects={refreshProjects}
            onSaveProject={() => {
              workspace.saveCurrentProject();
              window.setTimeout(refreshProjects, 100);
            }}
            onLoadProject={(id) => {
              void workspace.loadProject(id).then(() => {
                window.setTimeout(refreshProjects, 100);
              });
            }}
            onDeleteProject={(id) => {
              void workspace.deleteProject(id).then(() => refreshProjects());
            }}
          />
        );
      case "assets":
        return (
          <AssetLibraryPanel
            assetsText={rawWorkspace.assets}
            setAssetsText={(value) => workspace.patchWorkspace({ assets: value })}
            assetLibrary={assetLibrary}
            selected={selected}
            targetSceneId={assetTargetSceneId}
            setTargetSceneId={setAssetTargetSceneId}
            query={assetQuery}
            setQuery={setAssetQuery}
            tagFilter={assetTagFilter}
            setTagFilter={setAssetTagFilter}
            assetsValidatedAt={assetsValidatedAt}
            desktopMode={isDesktop()}
            mediaToolsInfo={workspace.mediaToolsInfo}
            probeInfo={workspace.probeInfo}
            mediaJobs={workspace.mediaJobs}
            onValidateAssets={() => void validateAssets()}
            onRefreshMediaTools={() => void workspace.refreshMediaTools()}
            onProbeAsset={(asset) => void workspace.probeAsset(asset.path)}
            onImportFiles={(files) => void workspace.importAssets(files)}
            onImportDesktop={() => void workspace.importAssetsDesktop()}
            onStartSlice={(asset, start, duration) =>
              workspace.startSlice(asset.path, start, duration)
            }
            onStartTranscribe={(asset) => workspace.startTranscribe(asset.path)}
            onStartTranscribeTranslate={(asset) => workspace.startTranscribe(asset.path, true)}
            onApplyTranscript={(asset) => workspace.applyTranscriptToDraft(asset.path)}
            onApplyAssignments={(asset, assignments) =>
              workspace.applyTranscriptAssignments(asset.path, assignments)
            }
            onSaveAssignments={(asset, assignments) =>
              workspace.saveTranscriptAssignments(asset.path, assignments)
            }
            onAttachSubtitleTrack={(asset, translated) =>
              workspace.attachSubtitleTrack(asset.path, translated)
            }
            onProbeWaveform={(asset) => void workspace.probeWaveform(asset.path)}
            waveforms={workspace.waveforms}
            onExportText={(fileName, content) =>
              void saveOrDownload(fileName, content, downloadTextFile)
            }
            onCancelMediaJob={workspace.cancelMediaJob}
            onRemoveMediaJob={workspace.removeMediaJob}
            onToggleAssetTag={toggleAssetTag}
            onSetAssetAuthorization={setAssetAuthorization}
            onAssignAssetToScene={assignAssetToTargetScene}
            onAutoFillMissingAssets={autoFillSelectedAssets}
            onAutoFillAllDraftAssets={autoFillAllDraftAssets}
          />
        );
      case "rules":
        return (
          <RulesPanel
            selected={selected}
            selectedAnalysis={selectedAnalysis}
            rules={generationRules}
            llmConfig={rawWorkspace.llmConfig}
            onSetLLMConfig={(llmConfig) => workspace.patchWorkspace({ llmConfig })}
            onToggleTemplate={toggleTemplate}
            onChange={(field, value) => {
              if (field === "tone") {
                setGenerationField("tone", value as ToneId);
              } else {
                setGenerationField(
                  field as "count" | "minDuration" | "maxDuration",
                  value as number,
                );
              }
            }}
            onRegenerate={regenerateAll}
          />
        );
      case "export":
        return (
          <ExportRunbook
            selected={selected}
            drafts={drafts}
            selectedIndex={selectedIndex}
            assetLibrary={assetLibrary}
            config={config}
            rules={generationRules}
            savedBatches={rawWorkspace.savedBatches}
            edits={rawWorkspace.draftEdits}
            renderJobs={rawWorkspace.renderJobs}
            copiedCommand={copiedCommand}
            gate={gate}
            onForceDownload={forceDownload}
            onDownloadCurrent={downloadCurrent}
            onDownloadAll={downloadAll}
            onDownloadApproved={downloadApproved}
            onCopyCurrentJson={() => void copyJsonPayload(currentTimelinePayload, "current-json")}
            onCopyAllJson={() => void copyJsonPayload(allTimelinePayload, "all-json")}
            onSaveBatch={saveCurrentBatch}
            onRestoreLatestBatch={restoreLatestBatch}
            onRestoreBatch={restoreBatch}
            onSelectDraft={selectDraft}
            onCopyCommand={(command, label) => void copyCommand(command, label)}
            desktopMode={isDesktop()}
            onDesktopSave={(fileName, content) =>
              saveOrDownload(fileName, content, downloadTextFile)
            }
            onRunDesktopRender={(job) => void workspace.runDesktopRenderJob(job)}
            onCancelDesktopRender={() => void workspace.cancelDesktopRenderJob()}
            onNewRenderJob={() => {
              if (
                window.confirm("为当前草稿创建渲染任务？任务文件需下载到 out/render-jobs/ 后运行。")
              ) {
                workspace.createRenderJobForSelected();
              }
            }}
            onRemoveRenderJob={workspace.removeRenderJob}
          />
        );
      case "diff":
        return (
          <DraftDiffPanel
            drafts={drafts}
            indexes={diffIndexes}
            onSetIndex={(column, index) =>
              setDiffIndexes((current) =>
                current.map((value, currentColumn) =>
                  currentColumn === column ? Math.min(index, drafts.length - 1) : value,
                ),
              )
            }
            onAddColumn={() =>
              setDiffIndexes((current) =>
                current.length >= drafts.length
                  ? current
                  : [...current, (current[current.length - 1] + 1) % drafts.length],
              )
            }
            onRemoveColumn={(column) =>
              setDiffIndexes((current) =>
                current.length <= 2 ? current : current.filter((_, index) => index !== column),
              )
            }
            onGoToDraft={(index) => {
              selectDraft(index);
              setActiveView("preview");
            }}
            onToggleReview={() => {
              const draft = drafts[diffIndexes[0]];
              if (draft?.draftId) {
                workspace.toggleReviewForDraft(draft.draftId, draft);
              }
            }}
            onMerge={(sourceIndex, targetIndex, sceneId, field) => {
              const source = drafts[sourceIndex];
              const target = drafts[targetIndex];
              if (!source || !target?.draftId) {
                return;
              }
              const patch: {
                publishCopy?: Partial<Timeline["publishCopy"]>;
                scenes?: Record<string, SceneEdit>;
              } = {};
              if (sceneId) {
                const scene = source.scenes.find((item) => item.id === sceneId);
                if (!scene) {
                  return;
                }
                if (field === "asset") {
                  patch.scenes = { [sceneId]: { asset: scene.asset, assetType: scene.assetType } };
                } else if (field === "headline") {
                  patch.scenes = { [sceneId]: { headline: scene.headline } };
                } else if (field === "subtitle") {
                  patch.scenes = { [sceneId]: { subtitle: scene.subtitle } };
                } else if (field === "duration") {
                  patch.scenes = { [sceneId]: { duration: scene.duration } };
                } else {
                  patch.scenes = { [sceneId]: { type: scene.type } };
                }
              } else if (field === "title" || field === "body" || field === "commentPrompt") {
                patch.publishCopy = { [field]: source.publishCopy[field] };
              } else if (field === "hashtags") {
                patch.publishCopy = { hashtags: source.publishCopy.hashtags };
              }
              workspace.applyMergeToDraft(target.draftId, patch);
            }}
            reviewStates={drafts.map((draft) => {
              const edit = rawWorkspace.draftEdits[draft.draftId ?? ""];
              return (edit?.reviewState ?? draft.reviewState) === "approved"
                ? "approved"
                : "pending";
            })}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className={"desktopShell" + (isDesktop() ? " desktop" : "")}>
      <WindowChrome />
      <div className="consoleShell">
        <Sidebar
          activeView={activeView}
          draftCount={drafts.length}
          blockingCount={selectedAnalysis.blockingCount}
          aiScore={selectedAIPlan.score}
          merchantName={config.name}
          location={config.location}
          industry={config.industry}
          visibleCount={visibleDrafts.length}
          totalCount={drafts.length}
          onNavigate={(view) => setActiveView(view)}
          onClearWorkspace={clearWorkspace}
        />

        <main className="mainSurface">
          <Topbar
            title={activeNavItem?.label ?? "全部草稿"}
            location={config.location}
            merchantName={config.name}
            query={query}
            setQuery={setQuery}
            onRegenerate={regenerateAll}
            onToggleInspector={() => setInspectorOpen((open) => !open)}
            onExportConfig={workspace.downloadMerchantConfig}
          />

          <MigrationNotice notice={notice} onDismiss={() => setNotice(null)} />

          <StatusStrip
            selectedIndex={selectedIndex}
            matchedAssets={selectedAnalysis.matchedAssets}
            totalScenes={selected.scenes.length}
            blockingCount={selectedAnalysis.blockingCount}
            reviewed={selectedReviewed}
            readyCount={draftStats.ready}
            totalCount={drafts.length}
            onShowInspector={() => {
              setActiveView("preview");
              setInspectorOpen(true);
            }}
            onShowAssets={() => setActiveView("assets")}
            onShowChecks={() => setActiveView("checks")}
            onToggleReview={toggleSelectedReview}
            onShowExport={() => setActiveView("export")}
          />

          <div className="contentRow">
            <section className="centerColumn" aria-label="主工作区">
              {centerView}
            </section>

            {showInspector ? (
              <>
                <div
                  className="inspectorBackdrop"
                  aria-hidden="true"
                  onClick={() => setInspectorOpen(false)}
                />
                <aside
                  className={"inspectorColumn" + (inspectorOpen ? " open" : "")}
                  aria-label="草稿检查器"
                >
                  <DraftInspector
                    selected={selected}
                    selectedIndex={selectedIndex}
                    selectedDraftId={selectedDraftId}
                    analysis={selectedAnalysis}
                    isEdited={selectedEdited}
                    isReviewed={selectedReviewed}
                    edit={selectedEdit}
                    assetList={assetList}
                    history={currentHistory}
                    onClose={() => setInspectorOpen(false)}
                    onResetDraft={() => {
                      if (window.confirm("还原当前草稿会丢弃本草稿的所有编辑和锁定。确定继续？")) {
                        resetSelectedDraft();
                      }
                    }}
                    onRegenerateDraft={regenerateSelectedDraft}
                    onToggleReview={toggleSelectedReview}
                    onUndo={workspace.undoSelectedEdit}
                    onRedo={workspace.redoSelectedEdit}
                    canUndo={workspace.canUndoSelected}
                    canRedo={workspace.canRedoSelected}
                    onAutoFillMissingAssets={autoFillSelectedAssets}
                    onSaveVersion={saveCurrentVersion}
                    onRestoreVersion={restoreVersion}
                    onUpdatePublish={updateSelectedPublish}
                    onUpdateHashtags={updateSelectedHashtags}
                    onUpdateScene={updateSelectedScene}
                    onMoveScene={moveSelectedScene}
                    onTogglePublishLock={togglePublishLock}
                    onToggleSceneLock={toggleSceneLock}
                    onDownloadCurrent={downloadCurrent}
                    onDownloadAll={downloadAll}
                    onCopyCurrentJson={() =>
                      void copyJsonPayload(currentTimelinePayload, "current-json")
                    }
                    onIssueAction={focusIssue}
                  />
                </aside>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
};
