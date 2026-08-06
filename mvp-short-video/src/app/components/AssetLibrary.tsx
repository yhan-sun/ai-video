import { useEffect, useRef, useState } from "react";
import { assetFileName, assetSource } from "../format.ts";
import { previewUrlFor } from "../desktop.ts";
import {
  buildBilingualSrt,
  buildSrt,
  buildSubtitlesPackage,
  buildVoiceOverScript,
  hydrateAssignments,
} from "../subtitles.ts";
import { assetTagOptions, sceneLabel } from "../types.ts";
import type {
  AssetAuthorization,
  AssetFileStatus,
  AssetItem,
  AssetTag,
  MediaJobState,
  Timeline,
} from "../types.ts";
import type { MediaInfo, MediaToolsInfo } from "../desktop.ts";
import { StatusBadge } from "./ui.tsx";

const statusTone = (
  status: AssetFileStatus,
): "success" | "danger" | "warning" | "neutral" | "info" => {
  if (status === "ok") {
    return "success";
  }
  if (status === "missing") {
    return "danger";
  }
  if (status === "unsupported") {
    return "warning";
  }
  if (status === "checking") {
    return "info";
  }
  return "neutral";
};

const statusLabel = (status: AssetFileStatus) => {
  if (status === "ok") {
    return "文件存在";
  }
  if (status === "missing") {
    return "文件缺失";
  }
  if (status === "unsupported") {
    return "格式不支持";
  }
  if (status === "checking") {
    return "校验中";
  }
  return "未校验";
};

const authorizationLabel = (status: AssetAuthorization["status"]) => {
  if (status === "authorized") {
    return "已授权";
  }
  if (status === "pending") {
    return "待确认";
  }
  return "未声明";
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return bytes + " B";
  }
  if (bytes < 1024 * 1024) {
    return Math.round(bytes / 1024) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const accentColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#007aff";

const WaveformCanvas = ({ peaks }: { peaks: number[] }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, width, height);
    if (peaks.length === 0) {
      return;
    }
    const barWidth = width / peaks.length;
    context.fillStyle = accentColor();
    peaks.forEach((peak, index) => {
      const barHeight = Math.max(2, (peak / 255) * height);
      const y = (height - barHeight) / 2;
      context.fillRect(index * barWidth, y, Math.max(1, barWidth - 1), barHeight);
    });
  }, [peaks]);

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={48}
      className="waveformCanvas"
      aria-label="音频波形"
    />
  );
};

// 时间轴对齐波形：按素材时长映射到草稿总时长坐标系（与字幕段时间轴同比例）。
const WaveformTimeline = ({
  peaks,
  assetDuration,
  totalDuration,
}: {
  peaks: number[];
  assetDuration: number;
  totalDuration: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, width, height);
    if (peaks.length === 0 || assetDuration <= 0 || totalDuration <= 0) {
      return;
    }
    const bucketSeconds = assetDuration / peaks.length;
    const pxPerSecond = width / totalDuration;
    context.fillStyle = accentColor();
    peaks.forEach((peak, index) => {
      const startX = index * bucketSeconds * pxPerSecond;
      const barWidth = Math.max(1, bucketSeconds * pxPerSecond - 1);
      const barHeight = Math.max(2, (peak / 255) * height);
      const y = (height - barHeight) / 2;
      context.fillRect(startX, y, barWidth, barHeight);
    });
  }, [assetDuration, peaks, totalDuration]);

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={40}
      className="waveformTimeline"
      aria-label="时间轴对齐波形"
    />
  );
};

const MediaToolbar = ({
  tools,
  onRefresh,
  onProbe,
  probeInfo,
  assetLibrary,
  mediaJobs,
  timeline,
  onStartSlice,
  onStartTranscribe,
  onStartTranscribeTranslate,
  onApplyTranscript,
  onApplyAssignments,
  onSaveAssignments,
  onAttachSubtitleTrack,
  onProbeWaveform,
  waveforms,
  onExportText,
  onCancelMediaJob,
  onRemoveMediaJob,
}: {
  tools: MediaToolsInfo | null;
  onRefresh: () => void;
  onProbe: (asset: AssetItem) => void;
  probeInfo: Record<string, MediaInfo | null>;
  assetLibrary: AssetItem[];
  mediaJobs: Record<string, MediaJobState>;
  timeline: Timeline;
  onStartSlice: (asset: AssetItem, start: number, duration: number) => void;
  onStartTranscribe: (asset: AssetItem) => void;
  onStartTranscribeTranslate: (asset: AssetItem) => void;
  onApplyTranscript: (asset: AssetItem) => void;
  onApplyAssignments: (
    asset: AssetItem,
    assignments: Array<{ index: number; sceneId: string | null }>,
  ) => void;
  onSaveAssignments: (asset: AssetItem, assignments: Record<number, string>) => void;
  onAttachSubtitleTrack: (asset: AssetItem, translated: boolean) => void;
  onProbeWaveform: (asset: AssetItem) => void;
  waveforms: Record<string, number[]>;
  onExportText: (fileName: string, content: string) => void;
  onCancelMediaJob: (jobId: string) => void;
  onRemoveMediaJob: (jobId: string) => void;
}) => {
  const [slicing, setSlicing] = useState<string | null>(null);
  const [sliceStart, setSliceStart] = useState(0);
  const [sliceDuration, setSliceDuration] = useState(5);
  const [aligning, setAligning] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [dragOverScene, setDragOverScene] = useState<string | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [voiceoverAsset, setVoiceoverAsset] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [overlayAssets, setOverlayAssets] = useState<Set<string>>(new Set());

  const transcriptAssets = assetLibrary.filter(
    (asset) => asset.type === "video" && asset.transcript?.segments?.length,
  );

  const openAlign = (assetPath: string) => {
    const asset = assetLibrary.find((item) => item.path === assetPath);
    setAligning(assetPath);
    setAssignments(hydrateAssignments(asset?.transcript?.assignments));
    setSelectedSegments(new Set());
    setOverlayAssets(new Set([assetPath]));
  };

  const toolsReady = Boolean(tools?.ffmpeg && tools?.ffprobe);
  const videoAssets = assetLibrary.filter((asset) => asset.type === "video");
  const totalDuration = timeline.scenes.reduce((sum, scene) => sum + scene.duration, 0);

  const assignedColor = (index: number, sceneId: string | null | undefined) => {
    if (!sceneId) {
      return "rgba(118, 118, 128, 0.45)";
    }
    const scene = timeline.scenes.find((item) => item.id === sceneId);
    return scene?.color ?? "rgba(118, 118, 128, 0.45)";
  };

  const handleSegmentDragStart = (event: React.DragEvent, index: number) => {
    const group = selectedSegments.has(index) ? selectedSegments : new Set([index]);
    event.dataTransfer.setData("text/plain", Array.from(group).join(","));
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleSceneDrop = (event: React.DragEvent, sceneId: string) => {
    event.preventDefault();
    setDragOverScene(null);
    const indexes = event.dataTransfer
      .getData("text/plain")
      .split(",")
      .map(Number)
      .filter(Number.isInteger);
    if (indexes.length > 0) {
      setAssignments((current) => {
        const next = { ...current };
        indexes.forEach((index) => {
          next[index] = sceneId;
        });
        return next;
      });
    }
  };

  const toggleSegmentSelection = (index: number, additive: boolean) => {
    setSelectedSegments((current) => {
      const next = new Set(current);
      if (additive) {
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
      } else {
        next.clear();
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="mediaToolbar">
      <div className="groupHeader">
        <strong>媒体处理</strong>
        <span>切片 / 转码 / 转写依赖本机 FFmpeg 与 whisper.cpp，桌面端可用。</span>
      </div>
      <div className="mediaToolsRow">
        <StatusBadge tone={tools?.ffmpeg ? "success" : "warning"}>
          ffmpeg {tools?.ffmpeg ? "✓" : "未安装"}
        </StatusBadge>
        <StatusBadge tone={tools?.ffprobe ? "success" : "warning"}>
          ffprobe {tools?.ffprobe ? "✓" : "未安装"}
        </StatusBadge>
        <StatusBadge tone={tools?.whisper ? "success" : "neutral"}>
          whisper {tools?.whisper ? "✓" : "可选"}
        </StatusBadge>
        <button type="button" className="linkButton" onClick={onRefresh}>
          重新检测
        </button>
        {transcriptAssets.length > 0 ? (
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              onExportText(
                "subtitles-package.txt",
                buildSubtitlesPackage(
                  transcriptAssets.map((item) => ({
                    asset: item.path,
                    language: item.transcript?.language,
                    segments: item.transcript?.segments ?? [],
                    translatedSegments: item.transcript?.translatedSegments,
                  })),
                ),
              )
            }
          >
            导出全部字幕包（{transcriptAssets.length} 个素材）
          </button>
        ) : null}
        {!toolsReady ? (
          <span className="assetValidationNote">
            安装方式：brew install ffmpeg whisper-cpp（转写还需下载模型，如 ggml-base.bin）
          </span>
        ) : null}
      </div>

      {mediaJobs && Object.keys(mediaJobs).length > 0 ? (
        <div className="mediaJobList">
          {Object.values(mediaJobs).map((job) => (
            <article className="mediaJobItem" key={job.id}>
              <div className="renderJobHead">
                <strong>
                  {job.kind === "slice" ? "切片" : "转写"} · {job.assetPath}
                </strong>
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
                    ? "完成"
                    : job.status === "failed"
                      ? "失败"
                      : job.status === "running"
                        ? "处理中"
                        : job.status === "cancelled"
                          ? "已取消"
                          : "排队"}
                </StatusBadge>
              </div>
              {job.error ? <p className="assetValidationNote danger">错误：{job.error}</p> : null}
              {job.log.length > 0 ? (
                <pre className="renderJobLog">{job.log.slice(-5).join("\n")}</pre>
              ) : null}
              <div className="cardActions">
                {job.status === "running" ? (
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => onCancelMediaJob(job.id)}
                  >
                    取消
                  </button>
                ) : job.status === "done" ||
                  job.status === "failed" ||
                  job.status === "cancelled" ? (
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => onRemoveMediaJob(job.id)}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {videoAssets.length === 0 ? (
        <div className="emptyMini">没有视频素材。导入 mp4/mov/webm 后可以在这里切片与转写。</div>
      ) : (
        <div className="mediaVideoGrid">
          {videoAssets.map((asset) => {
            const probe = probeInfo[asset.path];
            const duration = probe?.duration ?? asset.duration;
            const isSlicing = slicing === asset.path;
            const hasTranscript = Boolean(asset.transcript?.segments?.length);

            return (
              <article className="mediaVideoItem" key={asset.path}>
                <div className="mediaVideoHead">
                  <strong>{asset.fileName}</strong>
                  <StatusBadge tone={hasTranscript ? "success" : "neutral"}>
                    {hasTranscript ? "已转写" : "未转写"}
                  </StatusBadge>
                </div>
                <span className="renderJobOutput">
                  {duration ? "时长 " + Math.round(duration * 10) / 10 + "s" : "时长未知"}
                  {probe?.width && probe?.height
                    ? " · " + probe.width + "×" + probe.height
                    : asset.width && asset.height
                      ? " · " + asset.width + "×" + asset.height
                      : ""}
                  {!probe && toolsReady ? (
                    <button type="button" className="linkButton" onClick={() => onProbe(asset)}>
                      读取信息
                    </button>
                  ) : null}
                </span>
                {hasTranscript && asset.transcript ? (
                  aligning === asset.path ? (
                    <div className="alignPanel">
                      <div className="groupHeader">
                        <strong>字幕对齐</strong>
                        <span>
                          点击选中（Shift 多选），把字幕段拖到目标分镜；"自动"=按时间窗口归属。
                        </span>
                      </div>
                      <div className="alignSummary">
                        {(() => {
                          const assigned = Object.values(assignments).filter(
                            (sceneId) => sceneId !== "" && sceneId !== "auto",
                          ).length;
                          const excluded = Object.values(assignments).filter(
                            (sceneId) => sceneId === "",
                          ).length;
                          return (
                            <StatusBadge tone="info">
                              已指派 {assigned} · 排除 {excluded} · 自动{" "}
                              {Math.max(0, asset.transcript.segments.length - assigned - excluded)}
                            </StatusBadge>
                          );
                        })()}
                        <StatusBadge tone="success">已选 {selectedSegments.size} 段</StatusBadge>
                      </div>
                      <div className="subtitleTimeline" aria-label="字幕时间轴">
                        <div className="subtitleSceneTrack">
                          {timeline.scenes.map((scene) => (
                            <span
                              key={scene.id}
                              className={
                                "subtitleSceneBlock" +
                                (dragOverScene === scene.id ? " drag-over" : "")
                              }
                              style={{
                                width: (scene.duration / totalDuration) * 100 + "%",
                                background: scene.color,
                              }}
                              title={"拖字幕段到 " + scene.id}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "copy";
                                if (dragOverScene !== scene.id) {
                                  setDragOverScene(scene.id);
                                }
                              }}
                              onDragLeave={() => setDragOverScene(null)}
                              onDrop={(event) => handleSceneDrop(event, scene.id)}
                            />
                          ))}
                        </div>
                        <div className="subtitleSegmentTrack">
                          {asset.transcript.segments.map((segment, index) => {
                            const assigned = assignments[index] ?? "auto";
                            const left = (segment.start / totalDuration) * 100;
                            const width = Math.max(
                              2,
                              ((segment.end - segment.start) / totalDuration) * 100,
                            );
                            return (
                              <span
                                key={index}
                                className={
                                  "subtitleSegmentBlock draggable" +
                                  (selectedSegments.has(index) ? " selected" : "")
                                }
                                draggable
                                onDragStart={(event) => handleSegmentDragStart(event, index)}
                                onClick={(event) => toggleSegmentSelection(index, event.shiftKey)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleSegmentSelection(index, event.shiftKey);
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                                aria-label={
                                  "字幕段 " +
                                  (index + 1) +
                                  "（" +
                                  segment.text +
                                  "），当前" +
                                  (assigned === "auto"
                                    ? "自动"
                                    : assigned === ""
                                      ? "不填入"
                                      : assigned)
                                }
                                style={{
                                  left: left + "%",
                                  width: width + "%",
                                  background: assignedColor(
                                    index,
                                    assigned === "auto" ? null : assigned,
                                  ),
                                }}
                                title={
                                  "拖动以指派： " + segment.text + "（Shift 点击可多选后整组拖入）"
                                }
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="overlayPicker" aria-label="叠加素材">
                        <span>叠加素材：</span>
                        {transcriptAssets.map((item) => (
                          <label key={item.path} className="overlayCheck">
                            <input
                              type="checkbox"
                              checked={overlayAssets.has(item.path)}
                              onChange={() => {
                                setOverlayAssets((current) => {
                                  const next = new Set(current);
                                  if (next.has(item.path)) {
                                    next.delete(item.path);
                                  } else {
                                    next.add(item.path);
                                  }
                                  return next.size > 0 ? next : new Set([asset.path]);
                                });
                              }}
                            />
                            {assetFileName(item.path)}
                          </label>
                        ))}
                      </div>

                      {Array.from(overlayAssets)
                        .filter((path) => path !== asset.path)
                        .map((overlayPath) => {
                          const overlayAsset = assetLibrary.find(
                            (item) => item.path === overlayPath,
                          );
                          if (!overlayAsset?.transcript) {
                            return null;
                          }
                          return (
                            <div className="subtitleAssetTrack" key={overlayPath}>
                              <span className="subtitleAssetName">
                                {assetFileName(overlayPath)}
                              </span>
                              <div className="subtitleSegmentTrack">
                                {overlayAsset.transcript.segments.map((segment, index) => {
                                  const left = (segment.start / totalDuration) * 100;
                                  const width = Math.max(
                                    2,
                                    ((segment.end - segment.start) / totalDuration) * 100,
                                  );
                                  return (
                                    <span
                                      key={index}
                                      className="subtitleSegmentBlock readonly"
                                      style={{
                                        left: left + "%",
                                        width: width + "%",
                                        background: "rgba(118, 118, 128, 0.45)",
                                      }}
                                      title={segment.text}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                      {waveforms[asset.path] && asset.duration ? (
                        <WaveformTimeline
                          peaks={waveforms[asset.path]}
                          assetDuration={asset.duration}
                          totalDuration={totalDuration}
                        />
                      ) : null}

                      <p className="assetValidationNote">
                        提示：直接拖动当前素材的字幕色块到目标分镜色块；Shift
                        点击多选后可整组拖入；下方"叠加素材"可对照其他素材的字幕位置，波形与字幕同时间轴对齐。
                      </p>
                      <div className="assignmentList">
                        {asset.transcript.segments.map((segment, index) => (
                          <div className="assignmentRow" key={index}>
                            <span className="assignmentTime">
                              {segment.start.toFixed(1)}–{segment.end.toFixed(1)}s
                            </span>
                            <span className="assignmentText">{segment.text}</span>
                            <select
                              value={assignments[index] ?? "auto"}
                              aria-label={"字幕段 " + (index + 1) + " 归属分镜"}
                              onChange={(event) =>
                                setAssignments((current) => ({
                                  ...current,
                                  [index]: event.target.value,
                                }))
                              }
                            >
                              <option value="auto">自动</option>
                              <option value="">不填入</option>
                              {timeline.scenes.map((scene, sceneIndex) => (
                                <option key={scene.id} value={scene.id}>
                                  {String(sceneIndex + 1).padStart(2, "0")} {sceneLabel[scene.type]}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <div className="cardActions">
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() =>
                            setSelectedSegments(
                              new Set((asset.transcript?.segments ?? []).map((_, index) => index)),
                            )
                          }
                        >
                          全选
                        </button>
                        <button
                          type="button"
                          className="secondaryButton"
                          disabled={selectedSegments.size === 0}
                          onClick={() => setSelectedSegments(new Set())}
                        >
                          清除选择
                        </button>
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() => onSaveAssignments(asset, assignments)}
                        >
                          保存指派
                        </button>
                        <button
                          type="button"
                          className="primaryButton"
                          onClick={() =>
                            onApplyAssignments(
                              asset,
                              Object.entries(assignments).map(([index, sceneId]) => ({
                                index: Number(index),
                                sceneId: sceneId === "" ? null : sceneId,
                              })),
                            )
                          }
                        >
                          按指派填入草稿
                        </button>
                        <button
                          type="button"
                          className="linkButton"
                          onClick={() => {
                            setAligning(null);
                            setAssignments({});
                            setSelectedSegments(new Set());
                          }}
                        >
                          收起
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <pre className="transcriptPreview">
                        {asset.transcript.segments
                          .slice(0, 3)
                          .map((segment) => segment.text)
                          .join("\n")}
                        {asset.transcript.segments.length > 3 ? "\n…" : ""}
                      </pre>
                      <div className="cardActions">
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() => openAlign(asset.path)}
                        >
                          对齐字幕
                        </button>
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() => onApplyTranscript(asset)}
                        >
                          自动填入当前草稿
                        </button>
                      </div>
                    </>
                  )
                ) : null}
                <div className="sliceForm">
                  {isSlicing ? (
                    <>
                      <input
                        min={0}
                        type="number"
                        value={sliceStart}
                        aria-label="切片起点（秒）"
                        onChange={(event) =>
                          setSliceStart(Math.max(0, Number(event.target.value) || 0))
                        }
                      />
                      <span>–</span>
                      <input
                        min={0.5}
                        type="number"
                        value={sliceDuration}
                        aria-label="切片时长（秒）"
                        onChange={(event) =>
                          setSliceDuration(Math.max(0.5, Number(event.target.value) || 0.5))
                        }
                      />
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={!toolsReady}
                        onClick={() => {
                          onStartSlice(asset, sliceStart, sliceDuration);
                          setSlicing(null);
                        }}
                      >
                        开始切片
                      </button>
                      <button type="button" className="linkButton" onClick={() => setSlicing(null)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={!toolsReady}
                      onClick={() => setSlicing(asset.path)}
                    >
                      切片（起点/时长）
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={!tools?.whisper}
                    onClick={() => onStartTranscribe(asset)}
                  >
                    转写字幕
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={!tools?.whisper}
                    onClick={() => onStartTranscribeTranslate(asset)}
                  >
                    转写并翻译
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={!toolsReady}
                    onClick={() => {
                      if (!waveforms[asset.path]) {
                        onProbeWaveform(asset);
                      }
                    }}
                  >
                    {waveforms[asset.path] ? "波形已加载" : "加载波形"}
                  </button>
                </div>
                {waveforms[asset.path] ? <WaveformCanvas peaks={waveforms[asset.path]} /> : null}
                {hasTranscript ? (
                  <div className="cardActions voiceoverActions">
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() => {
                        setVoiceoverAsset(voiceoverAsset === asset.path ? null : asset.path);
                        setCopiedScript(false);
                      }}
                    >
                      {voiceoverAsset === asset.path ? "收起口播稿" : "生成口播稿"}
                    </button>
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() => onAttachSubtitleTrack(asset, false)}
                    >
                      嵌入字幕轨
                    </button>
                    {asset.transcript?.translatedSegments?.length ? (
                      <button
                        type="button"
                        className="linkButton"
                        onClick={() => onAttachSubtitleTrack(asset, true)}
                      >
                        嵌入双语字幕轨
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() =>
                        onExportText(
                          "subtitles-" + asset.fileName.replace(/\.[^.]+$/, "") + ".srt",
                          asset.transcript?.translatedSegments?.length
                            ? buildBilingualSrt(
                                asset.transcript.segments,
                                asset.transcript.translatedSegments,
                              )
                            : buildSrt(asset.transcript?.segments ?? []),
                        )
                      }
                    >
                      导出 SRT
                    </button>
                  </div>
                ) : null}
                {voiceoverAsset === asset.path && asset.transcript ? (
                  <div className="voiceoverPanel">
                    {(() => {
                      const script = buildVoiceOverScript(timeline, asset.transcript);
                      return (
                        <>
                          <div className="groupHeader">
                            <strong>口播稿</strong>
                            <span>按分镜窗口聚合字幕生成旁白，可复制或导出 txt。</span>
                          </div>
                          <div className="voiceoverScenes">
                            {script.scenes.map((scene) => (
                              <div className="voiceoverScene" key={scene.sceneId}>
                                <span>
                                  {String(scene.index + 1).padStart(2, "0")}{" "}
                                  {
                                    sceneLabel[
                                      timeline.scenes.find((item) => item.id === scene.sceneId)
                                        ?.type ?? "hook"
                                    ]
                                  }
                                </span>
                                <p>{scene.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className="cardActions">
                            <button
                              type="button"
                              className="secondaryButton"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(script.full)
                                  .then(() => setCopiedScript(true));
                              }}
                            >
                              {copiedScript ? "已复制" : "复制全文"}
                            </button>
                            <button
                              type="button"
                              className="secondaryButton"
                              onClick={() =>
                                onExportText(
                                  "voiceover-" + asset.fileName.replace(/\.[^.]+$/, "") + ".txt",
                                  script.full,
                                )
                              }
                            >
                              导出 txt
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const AssetLibraryPanel = ({
  assetsText,
  setAssetsText,
  assetLibrary,
  selected,
  targetSceneId,
  setTargetSceneId,
  query,
  setQuery,
  tagFilter,
  setTagFilter,
  assetsValidatedAt,
  desktopMode,
  mediaToolsInfo,
  probeInfo,
  mediaJobs,
  onValidateAssets,
  onRefreshMediaTools,
  onProbeAsset,
  onImportFiles,
  onImportDesktop,
  onStartSlice,
  onStartTranscribe,
  onStartTranscribeTranslate,
  onApplyTranscript,
  onApplyAssignments,
  onSaveAssignments,
  onAttachSubtitleTrack,
  onProbeWaveform,
  waveforms,
  onExportText,
  onCancelMediaJob,
  onRemoveMediaJob,
  onToggleAssetTag,
  onSetAssetAuthorization,
  onAssignAssetToScene,
  onAutoFillMissingAssets,
  onAutoFillAllDraftAssets,
}: {
  assetsText: string;
  setAssetsText: (value: string) => void;
  assetLibrary: AssetItem[];
  selected: Timeline;
  targetSceneId: string;
  setTargetSceneId: (sceneId: string) => void;
  query: string;
  setQuery: (value: string) => void;
  tagFilter: AssetTag | "all";
  setTagFilter: (value: AssetTag | "all") => void;
  assetsValidatedAt: string | null;
  desktopMode: boolean;
  mediaToolsInfo: MediaToolsInfo | null;
  probeInfo: Record<string, MediaInfo | null>;
  mediaJobs: Record<string, MediaJobState>;
  onValidateAssets: () => void;
  onRefreshMediaTools: () => void;
  onProbeAsset: (asset: AssetItem) => void;
  onImportFiles: (files: File[]) => void;
  onImportDesktop: () => void;
  onStartSlice: (asset: AssetItem, start: number, duration: number) => void;
  onStartTranscribe: (asset: AssetItem) => void;
  onStartTranscribeTranslate: (asset: AssetItem) => void;
  onApplyTranscript: (asset: AssetItem) => void;
  onApplyAssignments: (
    asset: AssetItem,
    assignments: Array<{ index: number; sceneId: string | null }>,
  ) => void;
  onSaveAssignments: (asset: AssetItem, assignments: Record<number, string>) => void;
  onAttachSubtitleTrack: (asset: AssetItem, translated: boolean) => void;
  onProbeWaveform: (asset: AssetItem) => void;
  waveforms: Record<string, number[]>;
  onExportText: (fileName: string, content: string) => void;
  onCancelMediaJob: (jobId: string) => void;
  onRemoveMediaJob: (jobId: string) => void;
  onToggleAssetTag: (asset: string, tag: AssetTag) => void;
  onSetAssetAuthorization: (asset: string, authorization: AssetAuthorization) => void;
  onAssignAssetToScene: (asset: AssetItem) => void;
  onAutoFillMissingAssets: () => void;
  onAutoFillAllDraftAssets: () => void;
}) => {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      await onImportFiles(Array.from(files));
    } catch {
      setImportError("导入失败：无法读取所选文件。");
    } finally {
      setImporting(false);
    }
  };

  const filteredAssets = assetLibrary
    .filter((asset) => (tagFilter === "all" ? true : asset.tags.includes(tagFilter)))
    .filter((asset) => {
      const lower = query.trim().toLowerCase();
      if (!lower) {
        return true;
      }

      return [asset.path, asset.fileName, asset.tags.join(" ")].some((value) =>
        value.toLowerCase().includes(lower),
      );
    });

  const missingCount = assetLibrary.filter((asset) => asset.status === "missing").length;
  const authorizedCount = assetLibrary.filter(
    (asset) => asset.authorization.status === "authorized",
  ).length;
  const remoteCount = assetLibrary.filter((asset) => asset.remote).length;

  return (
    <section className="panel viewPanel assetLibraryPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">素材库</p>
          <h2>客户授权素材</h2>
          <p>
            支持真实文件选择导入（计算
            hash、尺寸、时长与缩略图）、重复检测、标签与授权信息；默认禁止远程 URL 素材。
          </p>
        </div>
        <div className="buttonGroup">
          <StatusBadge tone="info">{assetLibrary.length} 个素材</StatusBadge>
          <StatusBadge
            tone={
              authorizedCount === assetLibrary.length && assetLibrary.length > 0
                ? "success"
                : "warning"
            }
          >
            已授权 {authorizedCount}/{assetLibrary.length}
          </StatusBadge>
          <StatusBadge tone={missingCount > 0 ? "danger" : "neutral"}>
            缺失 {missingCount}
          </StatusBadge>
          {remoteCount > 0 ? (
            <StatusBadge tone="danger">远程 {remoteCount}（默认禁止）</StatusBadge>
          ) : null}
        </div>
      </div>
      <div className="assetToolbar">
        <div className="searchField">
          <span>/</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件名或标签"
            aria-label="搜索素材"
          />
        </div>
        <div className="templateFilters" aria-label="素材标签过滤">
          <button
            className={tagFilter === "all" ? "active" : ""}
            type="button"
            onClick={() => setTagFilter("all")}
          >
            全部
          </button>
          {assetTagOptions.map((tag) => (
            <button
              className={tagFilter === tag ? "active" : ""}
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="assetTargetPicker">
          <span>替换到</span>
          <select
            value={targetSceneId}
            onChange={(event) => setTargetSceneId(event.target.value)}
            aria-label="选择素材替换目标分镜"
          >
            {selected.scenes.map((scene, index) => (
              <option key={scene.id} value={scene.id}>
                {String(index + 1).padStart(2, "0")} {sceneLabel[scene.type]}
              </option>
            ))}
          </select>
        </div>
        <div className="assetBatchActions">
          {desktopMode ? (
            <button type="button" className="primaryButton" onClick={onImportDesktop}>
              {importing ? "导入中…" : "选择本地文件（桌面）"}
            </button>
          ) : (
            <label className={"secondaryButton importFileButton" + (importing ? " busy" : "")}>
              {importing ? "导入中…" : "导入本地文件"}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                aria-label="选择本地素材文件（可多选）"
                onChange={(event) => {
                  void handleImport(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          )}
          <button type="button" className="secondaryButton" onClick={onValidateAssets}>
            {assetsValidatedAt ? "重新校验文件" : "校验素材文件"}
          </button>
          <button type="button" className="secondaryButton" onClick={onAutoFillMissingAssets}>
            补齐当前草稿
          </button>
          <button type="button" className="secondaryButton" onClick={onAutoFillAllDraftAssets}>
            补齐全部草稿
          </button>
        </div>
      </div>
      {importError ? <p className="assetValidationNote danger">{importError}</p> : null}
      {assetsValidatedAt ? (
        <p className="assetValidationNote">
          上次文件校验：{assetsValidatedAt}。缺失素材会标记为红色，补文件后重新校验。
        </p>
      ) : null}

      {desktopMode ? (
        <MediaToolbar
          tools={mediaToolsInfo}
          onRefresh={onRefreshMediaTools}
          onProbe={onProbeAsset}
          probeInfo={probeInfo}
          assetLibrary={assetLibrary}
          mediaJobs={mediaJobs}
          timeline={selected}
          onStartSlice={onStartSlice}
          onStartTranscribe={onStartTranscribe}
          onStartTranscribeTranslate={onStartTranscribeTranslate}
          onApplyTranscript={onApplyTranscript}
          onApplyAssignments={onApplyAssignments}
          onSaveAssignments={onSaveAssignments}
          onAttachSubtitleTrack={onAttachSubtitleTrack}
          onProbeWaveform={onProbeWaveform}
          waveforms={waveforms}
          onExportText={onExportText}
          onCancelMediaJob={onCancelMediaJob}
          onRemoveMediaJob={onRemoveMediaJob}
        />
      ) : null}
      <div className="assetLibraryLayout">
        <aside className="assetPathEditor">
          <div className="groupHeader">
            <strong>素材路径</strong>
            <span>每行一个，路径相对 public/，例如 assets/hero-courtyard.svg。</span>
          </div>
          <textarea
            value={assetsText}
            onChange={(event) => setAssetsText(event.target.value)}
            rows={11}
          />
        </aside>
        <div className="assetGrid">
          {filteredAssets.map((asset) => (
            <article
              className={"assetCard" + (asset.status === "missing" ? " missing" : "")}
              key={asset.path}
            >
              <div className="assetThumb">
                {asset.type === "image" ? (
                  asset.thumbnail ? (
                    <img src={asset.thumbnail} alt={asset.fileName} />
                  ) : (
                    <img
                      src={previewUrlFor(asset.path) ?? assetSource(asset.path)}
                      alt={asset.fileName}
                    />
                  )
                ) : asset.type === "video" ? (
                  asset.thumbnail ? (
                    <img src={asset.thumbnail} alt={asset.fileName} />
                  ) : (
                    <video
                      src={previewUrlFor(asset.path) ?? assetSource(asset.path)}
                      muted
                      playsInline
                    />
                  )
                ) : (
                  <div />
                )}
                <span className="assetFileStatus" data-status={asset.status}>
                  {statusLabel(asset.status)}
                </span>
              </div>
              <div className="assetInfo">
                <strong>{asset.fileName}</strong>
                <span>
                  {asset.type === "video" ? "视频" : "图片"} · {asset.path}
                </span>
                <small className="assetMetaLine">
                  {asset.hash ? "hash " + asset.hash.slice(0, 12) : ""}
                  {asset.width && asset.height ? " · " + asset.width + "×" + asset.height : ""}
                  {asset.duration ? " · " + asset.duration + "s" : ""}
                  {asset.size ? " · " + formatSize(asset.size) : ""}
                  {asset.imported ? " · 本机导入" : ""}
                </small>
              </div>
              <div className="assetUsage">
                <StatusBadge tone={asset.usedInSelected > 0 ? "success" : "neutral"}>
                  当前 {asset.usedInSelected}
                </StatusBadge>
                <StatusBadge tone={asset.usedInAll > 0 ? "info" : "neutral"}>
                  全部 {asset.usedInAll}
                </StatusBadge>
                <StatusBadge tone={statusTone(asset.status)}>
                  {statusLabel(asset.status)}
                </StatusBadge>
              </div>
              <div className="assetAuthorization">
                <select
                  value={asset.authorization.status}
                  aria-label="素材授权状态"
                  onChange={(event) =>
                    onSetAssetAuthorization(asset.path, {
                      ...asset.authorization,
                      status: event.target.value as AssetAuthorization["status"],
                    })
                  }
                >
                  <option value="unknown">授权：未声明</option>
                  <option value="authorized">授权：已获得</option>
                  <option value="pending">授权：待确认</option>
                </select>
                <input
                  value={asset.authorization.owner ?? ""}
                  placeholder="授权方（客户/摄影师）"
                  onChange={(event) =>
                    onSetAssetAuthorization(asset.path, {
                      ...asset.authorization,
                      owner: event.target.value,
                    })
                  }
                />
                <div className="authorizationDetails">
                  <input
                    value={asset.authorization.source ?? ""}
                    placeholder="授权来源（如：客户提供）"
                    aria-label="授权来源"
                    onChange={(event) =>
                      onSetAssetAuthorization(asset.path, {
                        ...asset.authorization,
                        source: event.target.value,
                      })
                    }
                  />
                  <input
                    value={asset.authorization.scope ?? ""}
                    placeholder="授权范围（如：抖音/小红书）"
                    aria-label="授权范围"
                    onChange={(event) =>
                      onSetAssetAuthorization(asset.path, {
                        ...asset.authorization,
                        scope: event.target.value,
                      })
                    }
                  />
                  <input
                    value={asset.authorization.authorizedAt ?? ""}
                    placeholder="授权日期 YYYY-MM-DD"
                    aria-label="授权日期"
                    onChange={(event) =>
                      onSetAssetAuthorization(asset.path, {
                        ...asset.authorization,
                        authorizedAt: event.target.value,
                      })
                    }
                  />
                  <input
                    value={asset.authorization.expiresAt ?? ""}
                    placeholder="到期时间 YYYY-MM-DD"
                    aria-label="授权到期时间"
                    onChange={(event) =>
                      onSetAssetAuthorization(asset.path, {
                        ...asset.authorization,
                        expiresAt: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="assetTags">
                {assetTagOptions.map((tag) => (
                  <button
                    className={asset.tags.includes(tag) ? "active" : ""}
                    key={tag}
                    type="button"
                    onClick={() => onToggleAssetTag(asset.path, tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="assetCardActions">
                <button
                  className="secondaryButton assetAssignButton"
                  type="button"
                  onClick={() => onAssignAssetToScene(asset)}
                >
                  用于当前分镜
                </button>
                <span className="assetAuthLabel">
                  {authorizationLabel(asset.authorization.status)}
                </span>
              </div>
            </article>
          ))}
          {filteredAssets.length === 0 ? (
            <div className="emptyState">
              <strong>没有匹配素材</strong>
              <span>调整搜索或标签过滤，或者在左侧添加素材路径。</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};
