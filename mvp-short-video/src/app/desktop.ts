// Tauri 桌面端桥接层。
// 约定：所有与 Rust 后端交互的方法均为 async；桌面端独有的能力在浏览器中自动降级。
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AssetMeta } from "../contract/schema.ts";

export type DesktopImportedRecord = {
  relPath: string;
  hash: string;
  size: number;
  name: string;
  duplicate: boolean;
};

export type DesktopCheckResult = {
  exists: boolean;
  source: string;
};

export type DesktopRenderJobInput = {
  id: string;
  timeline: unknown;
};

export type DesktopRenderEvent =
  | { type: "log"; line: string }
  | { type: "done"; output: string }
  | { type: "failed"; error: string }
  | { type: "cancelled"; output: string };

export const isDesktop = (): boolean =>
  typeof window !== "undefined" &&
  Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

export type DesktopPlatform = "macos" | "windows" | "linux" | "web";

export const desktopPlatform = (): DesktopPlatform => {
  if (!isDesktop()) {
    return "web";
  }
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "macos";
  }
  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }
  return "linux";
};

export const pickAssetFiles = async (): Promise<string[]> => {
  const paths = await invoke<string[]>("pick_asset_files");
  return paths;
};

export const importAssetFiles = async (paths: string[]): Promise<DesktopImportedRecord[]> => {
  const records = await invoke<DesktopImportedRecord[]>("import_asset_files", { paths });
  return records;
};

export const checkAssetExists = async (rel: string): Promise<DesktopCheckResult> => {
  const result = await invoke<DesktopCheckResult>("check_asset_exists", { rel });
  return result;
};

export const resolveAssetPath = async (rel: string): Promise<string | null> => {
  const path = await invoke<string | null>("resolve_asset_path", { rel });
  return path;
};

export const saveTextFile = async (
  defaultName: string,
  content: string,
): Promise<string | null> => {
  const path = await invoke<string | null>("save_text_file", { defaultName, content });
  return path;
};

export const runRenderJob = async (job: DesktopRenderJobInput): Promise<string> => {
  const output = await invoke<string>("run_render_job", { job });
  return output;
};

export const cancelRenderJob = async (): Promise<boolean> => {
  const cancelled = await invoke<boolean>("cancel_render_job");
  return cancelled;
};

export const onRenderEvent = async (
  jobId: string,
  callback: (event: DesktopRenderEvent) => void,
): Promise<UnlistenFn> => {
  return listen<DesktopRenderEvent>("render://" + jobId, (payload) => callback(payload.payload));
};

// ---- SQLite 数据层桥接（全部 async；浏览器环境不可用） ----

export const dbPut = async (store: string, key: string, value: unknown): Promise<void> => {
  await invoke("db_put", { store, key, value });
};

export const dbGet = async (store: string, key: string): Promise<unknown> => {
  return invoke("db_get", { store, key });
};

export const dbDelete = async (store: string, key: string): Promise<void> => {
  await invoke("db_delete", { store, key });
};

export const dbListKeys = async (store: string): Promise<string[]> => {
  return invoke("db_list_keys", { store });
};

export const dbPutBlob = async (key: string, data: Uint8Array): Promise<void> => {
  await invoke("db_put_blob", { key, data: Array.from(data) });
};

export const dbGetBlob = async (key: string): Promise<Uint8Array | null> => {
  const data = await invoke<number[] | null>("db_get_blob", { key });
  return data ? new Uint8Array(data) : null;
};

export const dbDeleteBlob = async (key: string): Promise<void> => {
  await invoke("db_delete_blob", { key });
};

export const projectSaveDesktop = async (project: ProjectData): Promise<void> => {
  await invoke("project_save", {
    projectId: project.id,
    name: project.name,
    config: project.config,
    rules: project.rules,
    assetsText: project.assetsText,
    tags: project.tags,
    authorization: project.authorization,
    savedAt: project.savedAt,
    full: project.full ?? null,
  });
};

export const projectListDesktop = async (): Promise<ProjectMeta[]> => {
  return invoke("project_list");
};

export const projectLoadDesktop = async (id: string): Promise<ProjectData | null> => {
  return invoke("project_load", { id });
};

export const projectDeleteDesktop = async (id: string): Promise<void> => {
  await invoke("project_delete", { id });
};

export type ProjectMeta = {
  id: string;
  name: string;
  savedAt: string;
};

// ---- 媒体处理（FFmpeg / Whisper）桥接（全部 async） ----

export type MediaToolsInfo = {
  ffmpeg: string | null;
  ffprobe: string | null;
  whisper: string | null;
};

export type MediaInfo = {
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
  size?: number;
};

export type MediaSliceResult = {
  relPath: string;
  absolutePath: string;
  thumbnailPath: string | null;
  duration: number;
};

export type MediaTranscribeResult = {
  language?: string;
  model?: string;
  segments: Array<{ start: number; end: number; text: string }>;
  srtPath?: string;
  translated?: boolean;
};

export const mediaTools = async (): Promise<MediaToolsInfo> => {
  return invoke("media_tools");
};

export const mediaProbe = async (path: string): Promise<MediaInfo | null> => {
  return invoke("media_probe", { path });
};

export const mediaSlice = async (job: {
  id: string;
  inputPath: string;
  start: number;
  duration: number;
  outputName: string;
}): Promise<MediaSliceResult> => {
  return invoke("media_slice", { job });
};

export const mediaTranscribe = async (job: {
  id: string;
  inputPath: string;
  outputName: string;
  model?: string;
  translate?: boolean;
}): Promise<MediaTranscribeResult> => {
  return invoke("media_transcribe", { job });
};

export const mediaWaveform = async (path: string): Promise<number[] | null> => {
  const peaks = await invoke<number[] | null>("media_waveform", { path });
  return peaks;
};

export const mediaCancel = async (jobId: string): Promise<boolean> => {
  return invoke("media_cancel", { jobId });
};

export const onMediaEvent = async (
  jobId: string,
  callback: (event: DesktopRenderEvent) => void,
): Promise<UnlistenFn> => {
  return listen<DesktopRenderEvent>("media://" + jobId, (payload) => callback(payload.payload));
};

export const desktopConvertFileSrc = (path: string): string => convertFileSrc(path);

export type ProjectData = {
  id: string;
  name: string;
  config: unknown;
  rules: unknown;
  assetsText: string;
  tags: unknown;
  authorization: unknown;
  savedAt: string;
  full?: unknown;
};

// 本机绝对路径 → 可预览 URL 的运行时缓存（仅本机使用，绝不写入导出包）。
const localAssetUrlCache = new Map<string, string>();

export const registerAssetLocalPath = (rel: string, absolutePath: string) => {
  if (!isDesktop()) {
    return;
  }
  localAssetUrlCache.set(rel, convertFileSrc(absolutePath));
};

export const hydrateAssetLocalPaths = (paths: Record<string, string>) => {
  if (!isDesktop()) {
    return;
  }
  Object.entries(paths).forEach(([rel, absolute]) => {
    localAssetUrlCache.set(rel, convertFileSrc(absolute));
  });
};

export const previewUrlFor = (rel: string): string | undefined => {
  if (!isDesktop()) {
    return undefined;
  }
  const normalized = rel
    .trim()
    .replace(/^\/+/, "")
    .replace(/^public\//, "");
  return localAssetUrlCache.get(normalized);
};

// 桌面导入结果 → 素材元数据（rel 为 library/ 相对路径；绝对路径只进缓存，不进 AssetMeta）。
export const assetMetaFromImportedRecord = (record: DesktopImportedRecord): AssetMeta => ({
  path: record.relPath,
  type: [".mp4", ".mov", ".webm"].some((ext) => record.relPath.toLowerCase().endsWith(ext))
    ? "video"
    : "image",
  tags: [],
  hash: record.hash,
  size: record.size,
  imported: true,
  duplicateOf: record.duplicate ? record.relPath : undefined,
  usedInAll: 0,
  usedInSelected: 0,
  authorization: { status: "unknown", source: "客户交付" },
});

// 桌面端可用时：优先保存对话框落盘；否则退回浏览器下载。
export const saveOrDownload = async (
  fileName: string,
  content: string,
  browserDownload: (fileName: string, content: string) => void,
): Promise<string | null> => {
  if (isDesktop()) {
    const path = await saveTextFile(fileName, content);
    if (path) {
      return path;
    }
    return null;
  }
  browserDownload(fileName, content);
  return null;
};
