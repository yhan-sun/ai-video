import type { Scene, Timeline } from "../contract/schema.ts";

export const listToText = (items: string[]) => items.join("\n");

export const textToList = (value: string) =>
  value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);

export const tagTextToList = (value: string) =>
  value
    .split(/[\s,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const downloadJson = (fileName: string, data: unknown) => {
  downloadTextFile(fileName, JSON.stringify(data, null, 2));
};

export const downloadTextFile = (fileName: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const createDraftJson = (value: unknown) => JSON.stringify(value, null, 2);

export const normalizeAssetPath = (asset: string) =>
  asset
    .trim()
    .replace(/^\/+/, "")
    .replace(/^public\//, "");

export const normalizeAssetList = (value: string[]) =>
  value.map(normalizeAssetPath).filter(Boolean);

export const assetTypeFromPath = (asset?: string): Scene["assetType"] => {
  if (!asset) {
    return "none";
  }

  return [".mp4", ".mov", ".webm"].some((ext) => asset.toLowerCase().endsWith(ext))
    ? "video"
    : "image";
};

export const assetSource = (asset?: string) => {
  if (!asset) {
    return "";
  }

  if (asset.startsWith("http://") || asset.startsWith("https://")) {
    return asset;
  }

  return "/" + normalizeAssetPath(asset);
};

export const assetFileName = (asset: string) => normalizeAssetPath(asset).split("/").pop() ?? asset;

export const nowLabel = () => new Date().toLocaleTimeString("zh-CN", { hour12: false });

export const createId = () =>
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

export const clampText = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength - 1) + "…" : trimmed;
};

export const pickConfigItem = (items: string[], index: number, fallback: string) =>
  items.length > 0 ? items[index % items.length] : fallback;

export const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const sameStringArray = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

export const durationOf = (timeline: Timeline) =>
  timeline.scenes.reduce((total, scene) => total + scene.duration, 0);

export const sceneTimings = (timeline: Timeline) => {
  let cursor = 0;

  return timeline.scenes.map((scene) => {
    const start = cursor;
    cursor += scene.duration;

    return {
      scene,
      start,
      end: cursor,
      label: start + "-" + cursor + "s",
    };
  });
};

export const stableHash = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

export const timelineContentHash = (timeline: Timeline) =>
  stableHash(
    JSON.stringify({
      title: timeline.publishCopy.title,
      body: timeline.publishCopy.body,
      commentPrompt: timeline.publishCopy.commentPrompt,
      hashtags: timeline.publishCopy.hashtags,
      scenes: timeline.scenes.map((scene) => [
        scene.id,
        scene.type,
        scene.headline,
        scene.subtitle,
        scene.duration,
        scene.asset,
        scene.assetType,
        scene.media,
      ]),
    }),
  );
