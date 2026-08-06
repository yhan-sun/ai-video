import fs from "node:fs";
import path from "node:path";
import {
  buildTimeline as buildTimelineTs,
  buildDrafts as buildDraftsTs,
  defaultGenerationRules as defaultRulesTs,
} from "../src/app/timeline.ts";
import { MerchantConfigSchema, TEMPLATE_IDS, TONE_IDS } from "../src/contract/schema.ts";

export const VIDEO_TYPES = [".mp4", ".mov", ".webm"];
export const IMAGE_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
export const SUPPORTED_ASSET_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

export const defaultGenerationRules = defaultRulesTs;

const templateIds = new Set(TEMPLATE_IDS);
const toneIds = new Set(TONE_IDS);

export const readJson = (filePath) => JSON.parse(fs.readFileSync(expandHome(filePath), "utf8"));

export const safeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

export const expandHome = (filePath) => {
  if (!filePath || !filePath.startsWith("~")) {
    return filePath;
  }

  return path.join(process.env.HOME ?? "", filePath.slice(1));
};

export const walkAssets = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkAssets(fullPath);
    }

    const ext = path.extname(entry.name).toLowerCase();
    return SUPPORTED_ASSET_TYPES.includes(ext) ? [fullPath] : [];
  });
};

export const normalizePublicPath = (projectRoot, filePath) => {
  const relative = path.relative(path.join(projectRoot, "public"), filePath);
  return relative.split(path.sep).join("/");
};

export const keywordScore = (asset, keywords) => {
  const lower = asset.toLowerCase();
  return keywords.reduce(
    (score, keyword) => score + (lower.includes(keyword.toLowerCase()) ? 1 : 0),
    0,
  );
};

export const pickAsset = (assets, keywords, fallbackIndex = 0) => {
  if (assets.length === 0) {
    return undefined;
  }

  const sorted = [...assets].sort((a, b) => {
    const score = keywordScore(b, keywords) - keywordScore(a, keywords);
    return score === 0 ? a.localeCompare(b) : score;
  });

  return sorted[fallbackIndex % sorted.length];
};

export const assetType = (asset) => {
  if (!asset) {
    return "none";
  }

  return VIDEO_TYPES.includes(path.extname(asset).toLowerCase()) ? "video" : "image";
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeRules = (rules = {}) => {
  const templateIdsInput = Array.isArray(rules.templateIds)
    ? rules.templateIds.filter((item) => templateIds.has(item))
    : defaultRulesTs.templateIds;
  const minDuration = clamp(Number(rules.minDuration ?? defaultRulesTs.minDuration), 10, 60);
  const maxDuration = clamp(
    Number(rules.maxDuration ?? defaultRulesTs.maxDuration),
    minDuration,
    60,
  );

  return {
    count: clamp(Number(rules.count ?? defaultRulesTs.count), 1, 20),
    templateIds: templateIdsInput.length > 0 ? templateIdsInput : defaultRulesTs.templateIds,
    tone: toneIds.has(rules.tone) ? rules.tone : defaultRulesTs.tone,
    minDuration,
    maxDuration,
  };
};

export const parseGenerationRules = (args = [], fallbackCount = defaultRulesTs.count) => {
  const rules = { ...defaultRulesTs, count: fallbackCount };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--count" && next) {
      rules.count = Number(next);
      index += 1;
    } else if (arg === "--template" && next) {
      rules.templateIds = next
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--tone" && next) {
      rules.tone = next;
      index += 1;
    } else if (arg === "--min-duration" && next) {
      rules.minDuration = Number(next);
      index += 1;
    } else if (arg === "--max-duration" && next) {
      rules.maxDuration = Number(next);
      index += 1;
    }
  }

  return normalizeRules(rules);
};

const normalizeConfig = (config) => MerchantConfigSchema.parse(config ?? {});

export const buildTimeline = (config, options = {}) => {
  const projectRoot = options.projectRoot ?? process.cwd();
  const assetsDir = path.join(projectRoot, config?.assetsDir ?? "public/assets");
  const assets =
    options.assets ?? walkAssets(assetsDir).map((asset) => normalizePublicPath(projectRoot, asset));
  const variant = options.variant ?? 0;

  return buildTimelineTs(normalizeConfig(config), assets, variant, normalizeRules(options.rules));
};

export const buildDrafts = (config, options = {}) => {
  const rules = normalizeRules(options.rules);
  const count = clamp(Number(options.count ?? rules.count), 1, 20);
  const projectRoot = options.projectRoot ?? process.cwd();
  const assetsDir = path.join(projectRoot, config?.assetsDir ?? "public/assets");
  const assets =
    options.assets ?? walkAssets(assetsDir).map((asset) => normalizePublicPath(projectRoot, asset));

  return buildDraftsTs(
    normalizeConfig(config),
    assets,
    count,
    { ...rules, count },
    options.variants,
  );
};

export const writeJson = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
};

export const templatesInfo = TEMPLATE_IDS.map((id) => ({ id }));
export const toneInfo = TONE_IDS.map((id) => ({ id }));
