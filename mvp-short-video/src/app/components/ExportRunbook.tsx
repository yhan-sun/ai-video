import { useState } from "react";
import { createExportPackage, createRenderableTimelinePayload } from "../export.ts";
import { downloadTextFile } from "../format.ts";
import { storyboardHtml } from "../storyboardHtml.ts";
import { templateLabel } from "../types.ts";
import type {
  AssetItem,
  DraftEdit,
  GenerationRules,
  MerchantConfig,
  RenderJob,
  SavedBatch,
  Timeline,
} from "../types.ts";
import { StatusBadge } from "./ui.tsx";

const STORYBOARD_STEPS = ["整理分镜结构", "匹配素材与时长", "应用共享视觉 tokens", "生成 HTML"];

export const ExportRunbook = ({
  selected,
  drafts,
  selectedIndex,
  assetLibrary,
  config,
  rules,
  savedBatches,
  edits,
  renderJobs,
  copiedCommand,
  gate,
  desktopMode,
  onDesktopSave,
  onRunDesktopRender,
  onRunRenderQueue,
  renderQueueRunning,
  renderQueueConcurrency,
  onSetRenderQueueConcurrency,
  onPauseRenderQueue,
  onResumeRenderQueue,
  onBuildReel,
  onCancelDesktopRender,
  onForceDownload,
  onDownloadCurrent,
  onDownloadAll,
  onDownloadApproved,
  onCopyCurrentJson,
  onCopyAllJson,
  onSaveBatch,
  onRestoreLatestBatch,
  onRestoreBatch,
  onSelectDraft,
  onCopyCommand,
  onNewRenderJob,
  onRemoveRenderJob,
}: {
  selected: Timeline;
  drafts: Timeline[];
  selectedIndex: number;
  assetLibrary: AssetItem[];
  config: MerchantConfig;
  rules: GenerationRules;
  savedBatches: SavedBatch[];
  edits: Record<string, DraftEdit>;
  renderJobs: RenderJob[];
  copiedCommand: string | null;
  gate: { ok: boolean; reasons: string[] };
  desktopMode: boolean;
  onDesktopSave: (fileName: string, content: string) => Promise<string | null>;
  onRunDesktopRender: (job: RenderJob) => void;
  onRunRenderQueue: () => void;
  renderQueueRunning: boolean;
  renderQueueConcurrency: number;
  onSetRenderQueueConcurrency: (value: number) => void;
  onPauseRenderQueue: () => void;
  onResumeRenderQueue: () => void;
  onBuildReel: () => void;
  onCancelDesktopRender: () => void;
  onForceDownload: () => void;
  onDownloadCurrent: () => void;
  onDownloadAll: () => void;
  onDownloadApproved: () => void;
  onCopyCurrentJson: () => void;
  onCopyAllJson: () => void;
  onSaveBatch: () => void;
  onRestoreLatestBatch: () => void;
  onRestoreBatch: (batch: SavedBatch) => void;
  onSelectDraft: (index: number) => void;
  onCopyCommand: (command: string, label: string) => void;
  onNewRenderJob: () => void;
  onRemoveRenderJob: (jobId: string) => void;
}) => {
  const [storyboardProgress, setStoryboardProgress] = useState<number | null>(null);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const draftNumber = String(selectedIndex + 1).padStart(2, "0");
  const currentFile = "timeline-" + draftNumber + ".json";
  const renderCommand = "npm run render";
  const currentSyncCommand = "npm run sync:timeline -- ~/Downloads/" + currentFile;

  const saveAs = async (fileName: string, content: string) => {
    if (desktopMode) {
      return onDesktopSave(fileName, content);
    }
    downloadTextFile(fileName, content);
    return null;
  };
  const batchSyncCommand = "npm run sync:timeline -- ~/Downloads/all-timelines.json";
  const currentStoryboardCommand =
    "node scripts/export-storyboard.mjs data/sample.timeline.json" +
    " out/storyboard-" +
    draftNumber +
    ".html";
  const currentRenderCommand =
    "npx remotion render src/index.ts VerticalDraft out/vertical-draft-" +
    draftNumber +
    ".mp4 --props=data/sample.timeline.json";
  const syncAndRenderCommand =
    "npm run sync:timeline -- ~/Downloads/" +
    currentFile +
    " && npx remotion render src/index.ts VerticalDraft out/vertical-draft-" +
    draftNumber +
    ".mp4 --props=data/sample.timeline.json";

  const approvedCount = drafts.filter(
    (draft) => edits[draft.draftId ?? ""]?.reviewState === "approved",
  ).length;

  const exportStoryboard = async () => {
    setStoryboardError(null);
    setStoryboardProgress(0);
    for (let step = 1; step <= STORYBOARD_STEPS.length; step += 1) {
      setStoryboardProgress(step);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
    }
    try {
      const html = storyboardHtml(selected, { title: "storyboard-" + draftNumber });
      await saveAs("storyboard-" + draftNumber + ".html", html);
    } catch (error) {
      setStoryboardError(error instanceof Error ? error.message : String(error));
    } finally {
      setStoryboardProgress(null);
    }
  };

  const downloadPackage = async () => {
    const content = JSON.stringify(
      createExportPackage({
        kind: "current",
        config,
        rules,
        drafts: [selected],
        assetLibrary,
        edits,
      }),
      null,
      2,
    );
    await saveAs("export-package-" + draftNumber + ".json", content);
  };

  const downloadRenderJobFile = async (job: RenderJob) => {
    await saveAs(
      "job-" + job.id + ".json",
      JSON.stringify(
        {
          id: job.id,
          status: job.status,
          outputPath: job.outputPath,
          timeline: selected,
          log: job.log,
        },
        null,
        2,
      ),
    );
  };

  return (
    <div className="runbook" id="export">
      <div className="sectionHeader compact">
        <div>
          <p className="eyebrow">导出</p>
          <h2>JSON、Storyboard、Remotion</h2>
          <p>导出包包含商家资料、生成规则、素材 manifest、审核元数据和 schemaVersion。</p>
        </div>
        <StatusBadge tone={assetLibrary.length > 0 ? "success" : "warning"}>
          当前 #{String(selectedIndex + 1).padStart(2, "0")}
        </StatusBadge>
      </div>

      <div className={"exportGatePanel " + (gate.ok ? "ok" : "blocked")}>
        <div>
          <strong>{gate.ok ? "当前草稿可以正式导出" : "当前草稿默认阻止正式导出"}</strong>
          <span>
            {gate.ok
              ? "已通过 schema、素材、内容和人工审核检查，可以下载 JSON 并进入 Storyboard / Remotion 渲染。"
              : "以下检查未通过，请先处理后再导出；确认风险可强制导出。"}
          </span>
        </div>
        <ul>
          {gate.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {!gate.ok ? (
          <button
            type="button"
            className="linkButton"
            onClick={() => {
              if (
                window.confirm(
                  "当前草稿未通过导出检查。强制导出后仍无法通过渲染链路自动审核，确定继续？",
                )
              ) {
                onForceDownload();
              }
            }}
          >
            强制导出（风险确认）
          </button>
        ) : null}
      </div>

      <div className="runbookGrid">
        <article>
          <strong>当前草稿 JSON</strong>
          <span>{currentFile}，适合交给 Remotion 或后续本地渲染链路。</span>
          <div className="cardActions">
            <button
              type="button"
              className="secondaryButton"
              disabled={!gate.ok}
              onClick={onCopyCurrentJson}
            >
              {copiedCommand === "current-json" ? "已复制" : "复制"}
            </button>
            <button
              type="button"
              className="secondaryButton"
              disabled={!gate.ok}
              onClick={onDownloadCurrent}
            >
              下载
            </button>
          </div>
        </article>
        <article>
          <strong>全部草稿 JSON</strong>
          <span>一次性导出 {drafts.length} 条候选草稿，方便给商家审核筛选。</span>
          <div className="cardActions">
            <button
              type="button"
              className="secondaryButton"
              disabled={!gate.ok}
              onClick={onCopyAllJson}
            >
              {copiedCommand === "all-json" ? "已复制" : "复制"}
            </button>
            <button
              type="button"
              className="secondaryButton"
              disabled={!gate.ok}
              onClick={onDownloadAll}
            >
              下载
            </button>
          </div>
        </article>
        <article>
          <strong>仅已审核草稿</strong>
          <span>
            只导出 {approvedCount}/{drafts.length} 条已人工审核通过的草稿；状态与内容哈希见 review
            metadata。
          </span>
          <div className="cardActions">
            <button
              type="button"
              className="secondaryButton"
              disabled={approvedCount === 0 || !gate.ok}
              onClick={onDownloadApproved}
            >
              下载已审核
            </button>
          </div>
        </article>
        <article>
          <strong>导出包（含 manifest）</strong>
          <span>
            timeline + asset manifest + review metadata + schemaVersion + draft/unreviewed 状态。
          </span>
          <div className="cardActions">
            <button
              type="button"
              className="secondaryButton"
              disabled={!gate.ok}
              onClick={downloadPackage}
            >
              下载导出包
            </button>
          </div>
        </article>
        <article>
          <strong>Storyboard</strong>
          <span>在浏览器直接生成 HTML 分镜预览（与 Remotion 共用视觉 tokens）。</span>
          <div className="cardActions">
            <button
              type="button"
              className="secondaryButton"
              onClick={() => void exportStoryboard()}
            >
              {storyboardProgress !== null
                ? "生成中 " + Math.round((storyboardProgress / STORYBOARD_STEPS.length) * 100) + "%"
                : "生成 Storyboard"}
            </button>
          </div>
          {storyboardProgress !== null ? (
            <div
              className="storyboardProgress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={STORYBOARD_STEPS.length}
              aria-valuenow={storyboardProgress}
            >
              {STORYBOARD_STEPS.slice(0, storyboardProgress).map((step) => (
                <span key={step}>✓ {step}</span>
              ))}
            </div>
          ) : null}
          {storyboardError ? (
            <p className="assetValidationNote danger">生成失败：{storyboardError}</p>
          ) : null}
        </article>
        <article>
          <strong>Remotion Render</strong>
          <span>最终 MP4 渲染入口，默认读取已同步的 data/sample.timeline.json。</span>
          <code>{renderCommand}</code>
          <button
            type="button"
            className="linkButton"
            onClick={() => onCopyCommand(renderCommand, "render")}
          >
            {copiedCommand === "render" ? "已复制" : "复制命令"}
          </button>
        </article>
      </div>

      <div className="renderCommandPanel">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">渲染任务</p>
            <h2>Render Job：可见进度、日志、取消与输出位置</h2>
          </div>
          <div className="buttonGroup">
            <button
              type="button"
              className="secondaryButton"
              disabled={!gate.ok}
              onClick={onNewRenderJob}
            >
              {desktopMode ? "在桌面端渲染当前草稿" : "新建渲染任务"}
            </button>
            {desktopMode ? (
              <>
                <select
                  value={renderQueueConcurrency}
                  aria-label="批量渲染并发数"
                  onChange={(event) =>
                    onSetRenderQueueConcurrency(
                      Math.max(1, Math.min(3, Number(event.target.value) || 1)),
                    )
                  }
                >
                  <option value={1}>并发 1</option>
                  <option value={2}>并发 2</option>
                  <option value={3}>并发 3</option>
                </select>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={renderQueueRunning || !gate.ok}
                  onClick={onRunRenderQueue}
                >
                  {renderQueueRunning ? "批量渲染中…" : "批量渲染已审核草稿"}
                </button>
                {renderQueueRunning ? (
                  <button type="button" className="secondaryButton" onClick={onPauseRenderQueue}>
                    暂停
                  </button>
                ) : null}
                <button type="button" className="secondaryButton" onClick={onResumeRenderQueue}>
                  恢复
                </button>
                <button type="button" className="secondaryButton" onClick={onBuildReel}>
                  生成预览合辑
                </button>
              </>
            ) : null}
          </div>
        </div>
        <p className="renderJobHint">
          {desktopMode
            ? "桌面端会在本机后台启动 Remotion 渲染：进度日志实时滚动、可取消，错误原因与输出位置（应用数据目录 renders/ 下）都会显示在这里。"
            : "任务文件会列出渲染命令。下载任务文件到 out/render-jobs/ 后在终端运行："}
          {!desktopMode ? (
            <code>node scripts/render-job.mjs out/render-jobs/job-&lt;id&gt;.json</code>
          ) : null}
          {!desktopMode ? "（Ctrl+C 取消，进度与错误实时写回任务文件，输出为 MP4）。" : null}
        </p>
        <div className="renderJobList">
          {renderJobs.length === 0 ? (
            <div className="emptyMini">
              {desktopMode
                ? "还没有渲染任务。当前草稿审核通过后点击“在桌面端渲染当前草稿”。"
                : "还没有渲染任务。当前草稿审核通过后点击“新建渲染任务”。"}
            </div>
          ) : (
            renderJobs.map((job) => (
              <article className="renderJobItem" key={job.id}>
                <div className="renderJobHead">
                  <strong>{job.title}</strong>
                  <StatusBadge
                    tone={
                      job.status === "done"
                        ? "success"
                        : job.status === "failed"
                          ? "danger"
                          : job.status === "running"
                            ? "info"
                            : "neutral"
                    }
                  >
                    {job.status === "done"
                      ? "已完成"
                      : job.status === "failed"
                        ? "失败"
                        : job.status === "running"
                          ? "渲染中"
                          : job.status === "cancelled"
                            ? "已取消"
                            : "队列中"}
                  </StatusBadge>
                </div>
                <code>{desktopMode ? job.outputPath : job.command}</code>
                <span className="renderJobOutput">输出位置：{job.outputPath}</span>
                {job.error ? <p className="assetValidationNote danger">错误：{job.error}</p> : null}
                {job.log.length > 0 ? (
                  <pre className="renderJobLog">{job.log.slice(-8).join("\n")}</pre>
                ) : null}
                <div className="cardActions">
                  {desktopMode && job.status === "running" ? (
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => {
                        if (window.confirm("取消当前渲染任务？进度不会保留。")) {
                          onCancelDesktopRender();
                        }
                      }}
                    >
                      取消渲染
                    </button>
                  ) : null}
                  {desktopMode && job.status !== "running" ? (
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={!gate.ok && job.status === "queued"}
                      onClick={() => onRunDesktopRender(job)}
                    >
                      {job.status === "done" ? "重新渲染" : "开始渲染"}
                    </button>
                  ) : null}
                  {!desktopMode ? (
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => void downloadRenderJobFile(job)}
                    >
                      下载任务文件
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => {
                      if (window.confirm("移除渲染任务记录？（不会取消已在终端运行的任务）")) {
                        onRemoveRenderJob(job.id);
                      }
                    }}
                  >
                    移除记录
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="renderCommandPanel">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">当前编号命令</p>
            <h2>选择草稿并复制精确命令</h2>
          </div>
          <select
            value={selectedIndex}
            onChange={(event) => onSelectDraft(Number(event.target.value))}
            aria-label="选择导出草稿编号"
          >
            {drafts.map((draft, index) => (
              <option key={draft.draftId ?? draft.template + index} value={index}>
                {String(index + 1).padStart(2, "0")}{" "}
                {templateLabel[draft.template] ?? draft.template}
              </option>
            ))}
          </select>
        </div>
        <div className="commandRows">
          <article>
            <strong>同步当前下载</strong>
            <code>{currentSyncCommand}</code>
            <button
              className="linkButton"
              type="button"
              onClick={() => onCopyCommand(currentSyncCommand, "current-sync")}
            >
              {copiedCommand === "current-sync" ? "已复制" : "复制命令"}
            </button>
          </article>
          <article>
            <strong>同步全部下载</strong>
            <code>{batchSyncCommand}</code>
            <button
              className="linkButton"
              type="button"
              onClick={() => onCopyCommand(batchSyncCommand, "batch-sync")}
            >
              {copiedCommand === "batch-sync" ? "已复制" : "复制命令"}
            </button>
          </article>
          <article>
            <strong>当前 Storyboard</strong>
            <code>{currentStoryboardCommand}</code>
            <button
              className="linkButton"
              type="button"
              onClick={() => onCopyCommand(currentStoryboardCommand, "current-storyboard")}
            >
              {copiedCommand === "current-storyboard" ? "已复制" : "复制命令"}
            </button>
          </article>
          <article>
            <strong>当前 Remotion Render</strong>
            <code>{currentRenderCommand}</code>
            <button
              className="linkButton"
              type="button"
              onClick={() => onCopyCommand(currentRenderCommand, "current-render")}
            >
              {copiedCommand === "current-render" ? "已复制" : "复制命令"}
            </button>
          </article>
          <article>
            <strong>同步并渲染（推荐）</strong>
            <span>
              先同步刚导出的 JSON 到 data/sample.timeline.json，再渲染，保证渲染的就是当前草稿。
            </span>
            <code>{syncAndRenderCommand}</code>
            <button
              className="linkButton"
              type="button"
              onClick={() => onCopyCommand(syncAndRenderCommand, "sync-and-render")}
            >
              {copiedCommand === "sync-and-render" ? "已复制" : "复制命令"}
            </button>
          </article>
        </div>
      </div>

      <div className="exportJsonPreview">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">当前导出结构</p>
            <h2>字段预览</h2>
          </div>
          <StatusBadge tone="neutral">{selected.scenes.length} 分镜</StatusBadge>
        </div>
        <pre>
          {JSON.stringify(
            createRenderableTimelinePayload({
              timeline: selected,
              config,
              rules,
              selectedDraftId: selected.draftId ?? "",
              assetLibrary,
            }),
            null,
            2,
          ).slice(0, 1800)}
        </pre>
      </div>
      <div className="persistencePanel">
        <div>
          <p className="eyebrow">本地持久化</p>
          <h2>批次保存与恢复</h2>
          <span>已保存 {savedBatches.length} 个批次；工作区也会自动恢复上次浏览器状态。</span>
        </div>
        <div className="buttonGroup">
          <button type="button" className="secondaryButton" onClick={onSaveBatch}>
            保存当前批次
          </button>
          <button
            type="button"
            className="secondaryButton"
            disabled={savedBatches.length === 0}
            onClick={onRestoreLatestBatch}
          >
            恢复上次保存
          </button>
        </div>
      </div>
      {savedBatches.length > 0 ? (
        <div className="savedBatchList">
          {savedBatches.map((batch) => (
            <button
              className="savedBatchItem"
              key={batch.id}
              type="button"
              onClick={() => onRestoreBatch(batch)}
            >
              <strong>{batch.label}</strong>
              <span>
                {new Date(batch.savedAt).toLocaleString("zh-CN")} · {batch.rules.count} 条 · 草稿 #
                {batch.selectedDraftId ? "已选" : "默认"}
              </span>
              <StatusBadge tone="info">恢复</StatusBadge>
            </button>
          ))}
        </div>
      ) : (
        <div className="emptyMini">
          还没有保存批次。点击“保存当前批次”后，这里会显示可恢复的工作区快照。
        </div>
      )}
    </div>
  );
};
