import type { ImportedAsset } from "./types.ts";
import type { AssetMeta } from "../contract/schema.ts";
import { normalizeAssetPath } from "./format.ts";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export const fileTypeOf = (file: File): "image" | "video" | null => {
  if (IMAGE_TYPES.includes(file.type)) {
    return "image";
  }
  if (VIDEO_TYPES.includes(file.type)) {
    return "video";
  }
  return null;
};

export const sha256Hex = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const canvasThumbnail = (source: HTMLImageElement | HTMLVideoElement, maxWidth = 160) => {
  const width =
    "videoWidth" in source ? source.videoWidth : (source as HTMLImageElement).naturalWidth;
  const height =
    "videoHeight" in source ? source.videoHeight : (source as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxWidth / (width || 1));
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }
  context.drawImage(source, 0, 0, canvasWidth, canvasHeight);
  return canvas.toDataURL("image/jpeg", 0.72);
};

export type MediaMeta = {
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
};

const readImageMetaFromUrl = (url: string) =>
  new Promise<MediaMeta>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        thumbnail: canvasThumbnail(image),
      });
    };
    image.onerror = () => resolve({});
    image.src = url;
  });

const readVideoMetaFromUrl = (url: string) =>
  new Promise<MediaMeta>((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration)
        ? Math.round(video.duration * 10) / 10
        : undefined;
      const seekTo = Math.min(0.5, (video.duration ?? 0) / 2);
      video.currentTime = seekTo;
      video.onseeked = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          thumbnail: canvasThumbnail(video),
        });
      };
      video.onerror = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight, duration });
      };
    };
    video.onerror = () => resolve({});
    video.src = url;
  });

export const readMediaMetaFromUrl = async (
  url: string,
  type: "image" | "video",
): Promise<MediaMeta> => {
  try {
    return type === "image" ? await readImageMetaFromUrl(url) : await readVideoMetaFromUrl(url);
  } catch {
    return {};
  }
};

export const readImageMeta = (file: File) =>
  new Promise<MediaMeta>((resolve) => {
    void (async () => {
      try {
        const url = URL.createObjectURL(file);
        const meta = await readImageMetaFromUrl(url);
        URL.revokeObjectURL(url);
        resolve(meta);
      } catch {
        resolve({});
      }
    })();
  });

export const readVideoMeta = (file: File) =>
  new Promise<MediaMeta>((resolve) => {
    void (async () => {
      try {
        const url = URL.createObjectURL(file);
        const meta = await readVideoMetaFromUrl(url);
        URL.revokeObjectURL(url);
        resolve(meta);
      } catch {
        resolve({});
      }
    })();
  });

export type ImportFileResult = {
  assets: ImportedAsset[];
  duplicates: Array<{ path: string; duplicateOf: string }>;
  skipped: string[];
};

export const importFiles = async (
  files: File[],
  existingMeta: Record<string, AssetMeta>,
): Promise<ImportFileResult> => {
  const assets: ImportedAsset[] = [];
  const duplicates: Array<{ path: string; duplicateOf: string }> = [];
  const skipped: string[] = [];

  for (const file of files) {
    const type = fileTypeOf(file);
    if (!type) {
      skipped.push(file.name + "（格式不支持）");
      continue;
    }

    const hash = await sha256Hex(file);
    const existing = Object.values(existingMeta).find((meta) => meta.hash === hash);
    if (existing) {
      duplicates.push({ path: normalizeAssetPath(file.name), duplicateOf: existing.path });
      continue;
    }

    const meta = type === "image" ? await readImageMeta(file) : await readVideoMeta(file);
    const safeName = file.name.replace(/[\\/:#*?"<>|]/g, "-");
    const hashShort = hash.slice(0, 8);
    assets.push({
      file,
      path: "imported/" + hashShort + "-" + safeName,
      hash,
      type,
      size: file.size,
      ...meta,
    });
  }

  return { assets, duplicates, skipped };
};

export const importedAssetMeta = (asset: ImportedAsset): AssetMeta => ({
  path: asset.path,
  type: asset.type,
  tags: [],
  hash: asset.hash,
  size: asset.size,
  width: asset.width,
  height: asset.height,
  duration: asset.duration,
  thumbnail: asset.thumbnail,
  imported: true,
  usedInAll: 0,
  usedInSelected: 0,
  authorization: { status: "unknown", source: "客户交付" },
});
