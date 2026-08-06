import type { AssetMeta, AssetTag, Scene, SceneType, Timeline } from "../contract/schema.ts";
import { assetFileName, assetTypeFromPath, normalizeAssetPath } from "./format.ts";
import type { AssetAuthorization, AssetFileStatus, AssetItem } from "./types.ts";

export const scenePreferredTags: Record<SceneType, AssetTag[]> = {
  hook: ["环境", "人物"],
  pain: ["人物", "环境"],
  proof: ["证据", "菜品", "环境"],
  offer: ["CTA", "证据"],
  cta: ["CTA", "环境"],
};

export const inferAssetTags = (asset: string): AssetTag[] => {
  const lower = asset.toLowerCase();
  const tags: AssetTag[] = [];

  if (/hero|yard|view|room|front|door|环境|院|房|景/.test(lower)) {
    tags.push("环境");
  }
  if (/menu|dish|food|菜|餐|产品/.test(lower)) {
    tags.push("菜品");
  }
  if (/people|person|staff|customer|人物|老板|客人/.test(lower)) {
    tags.push("人物");
  }
  if (/proof|review|rating|证据|评价|口碑/.test(lower)) {
    tags.push("证据");
  }
  if (/cta|offer|coupon|route|map|优惠|路线|二维码/.test(lower)) {
    tags.push("CTA");
  }

  return tags.length > 0 ? tags : ["环境"];
};

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

export const isSupportedAssetExtension = (asset: string) => {
  const lower = normalizeAssetPath(asset).toLowerCase();
  return (
    IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
    VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))
  );
};

export const isHttpAsset = (asset?: string) =>
  Boolean(asset && (asset.startsWith("http://") || asset.startsWith("https://")));

export const hasRemoteSceneAssets = (timeline: Timeline) =>
  timeline.scenes.some((scene) => isHttpAsset(scene.asset));

export const assetMatches = (timeline: Timeline, availableAssets: string[]) => {
  const availableSet = new Set(availableAssets.map(normalizeAssetPath));

  return timeline.scenes.filter((scene) => {
    if (!scene.asset || scene.assetType === "none") {
      return false;
    }

    if (isHttpAsset(scene.asset)) {
      return true;
    }

    return availableSet.has(normalizeAssetPath(scene.asset));
  }).length;
};

export const isPlaceholderAsset = (scene: Scene, availableAssets: string[]) => {
  if (!scene.asset || scene.assetType === "none") {
    return true;
  }

  if (isHttpAsset(scene.asset)) {
    return false;
  }

  return !new Set(availableAssets.map(normalizeAssetPath)).has(normalizeAssetPath(scene.asset));
};

export const buildAssetLibrary = (
  assetList: string[],
  drafts: Timeline[],
  selected: Timeline,
  assetTags: Record<string, AssetTag[]>,
  assetAuthorization: Record<string, AssetAuthorization>,
  assetStatus: Record<string, AssetFileStatus>,
  assetMeta: Record<string, AssetMeta> = {},
): AssetItem[] => {
  const allSceneAssets = drafts.flatMap((draft) =>
    draft.scenes.map((scene) => scene.asset).filter(Boolean),
  );
  const selectedSceneAssets = selected.scenes.map((scene) => scene.asset).filter(Boolean);

  return assetList.map((asset) => {
    const path = normalizeAssetPath(asset);
    const meta = assetMeta[path];

    return {
      path,
      type: meta?.type ?? assetTypeFromPath(path),
      fileName: assetFileName(path),
      tags: assetTags[path] ?? inferAssetTags(path),
      authorization: assetAuthorization[path] ?? meta?.authorization ?? { status: "unknown" },
      status: assetStatus[path] ?? "unchecked",
      usedInAll: allSceneAssets.filter(
        (sceneAsset) => normalizeAssetPath(sceneAsset ?? "") === path,
      ).length,
      usedInSelected: selectedSceneAssets.filter(
        (sceneAsset) => normalizeAssetPath(sceneAsset ?? "") === path,
      ).length,
      hash: meta?.hash,
      size: meta?.size,
      width: meta?.width,
      height: meta?.height,
      duration: meta?.duration,
      thumbnail: meta?.thumbnail,
      imported: meta?.imported,
      duplicateOf: meta?.duplicateOf,
      remote: isHttpAsset(path),
      transcript: meta?.transcript,
      sourceClip: meta?.sourceClip,
    };
  });
};

export const pickAssetForScene = (scene: Scene, assetLibrary: AssetItem[], offset = 0) => {
  const preferredTags = scenePreferredTags[scene.type] ?? ["环境"];
  const candidates = assetLibrary.filter((asset) =>
    preferredTags.some((tag) => asset.tags.includes(tag)),
  );
  const pool = candidates.length > 0 ? candidates : assetLibrary;

  return pool[offset % Math.max(pool.length, 1)];
};

export const validateAssetFile = async (asset: string): Promise<AssetFileStatus> => {
  const path = normalizeAssetPath(asset);
  if (!isSupportedAssetExtension(path)) {
    return "unsupported";
  }
  if (isHttpAsset(path)) {
    return "ok";
  }

  try {
    const response = await fetch("/" + path, { method: "HEAD" });
    if (response.ok) {
      return "ok";
    }
    if (response.status === 404) {
      return "missing";
    }
    return "missing";
  } catch {
    return "missing";
  }
};

export const validateAssetFiles = async (
  assetList: string[],
  onProgress: (path: string, status: AssetFileStatus) => void,
) => {
  const results: Record<string, AssetFileStatus> = {};

  await Promise.all(
    assetList.map(async (asset) => {
      const path = normalizeAssetPath(asset);
      const status = await validateAssetFile(path);
      results[path] = status;
      onProgress(path, status);
    }),
  );

  return results;
};
