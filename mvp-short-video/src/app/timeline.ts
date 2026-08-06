import {
  SCHEMA_VERSION,
  type GenerationMeta,
  type GenerationRules,
  type MerchantConfig,
  type Scene,
  type SceneType,
  type TemplateId,
  type Timeline,
  type ToneId,
} from "../contract/schema.ts";
import { stableHash } from "./format.ts";

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

export const defaultGenerationRules: GenerationRules = {
  count: 10,
  templateIds: ["avoid-mistake", "hidden-gem", "comparison", "checklist"],
  tone: "practical",
  minDuration: 18,
  maxDuration: 24,
  seed: 1,
};

export const sampleConfig: MerchantConfig = {
  name: "大理云上小院",
  industry: "民宿",
  location: "云南大理",
  region: "大理",
  audience: "第一次来大理的情侣和亲子游客",
  assetsDir: "public/assets",
  keyword: "大理",
  hook: "第一次来大理，别急着订海景房",
  sellingPoints: [
    "离古城近但晚上安静",
    "院子可以喝茶看云",
    "停车方便，适合亲子和情侣",
    "老板能给不踩坑路线",
  ],
  painPoints: ["旺季海边吵、停车难、价格还高", "只看网红机位，很容易把行程排得又累又赶"],
  proofPoints: [
    "住在古城附近的小院，白天出门方便，晚上还能安静休息",
    "亲子和情侣更适合慢节奏，不用每天赶景点",
  ],
  offer: "评论区回复“大理”，领取 3 天不踩坑路线表",
  cta: "想要路线表，评论区打“大理”",
  musicHint: "轻快旅行 / 80-100 BPM / 清爽不吵",
  hashtags: ["#云南旅游", "#大理旅行", "#民宿推荐", "#亲子游", "#旅行攻略"],
  brandStyle: "克制、真实、慢节奏",
};

export const sampleAssets = [
  "assets/hero-courtyard.svg",
  "assets/yard-view.svg",
  "assets/route-map.svg",
  "assets/review-proof.svg",
];

export const fitText = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength - 1) + "…" : trimmed;
};

export const HEADLINE_MAX = 32;
export const SUBTITLE_MAX = 60;
export const TITLE_MAX = 34;
export const BODY_MAX = 200;

export type IndustryProfile = {
  id: string;
  label: string;
  match: RegExp;
  hookLead: string;
  painLead: string[];
  proofLead: string[];
  offerLead: string;
  ctaLead: string;
};

export const industryProfiles: IndustryProfile[] = [
  {
    id: "minsu",
    label: "民宿",
    match: /民宿|客栈|小院|酒店|青旅|度假村/,
    hookLead: "住",
    painLead: ["只看网红房型容易踩坑", "图好看不等于睡得好、停车方便"],
    proofLead: ["实地住过才知道，安静和便利更值钱", "房间、院子、停车这些细节决定了体验"],
    offerLead: "我把挑选和避坑要点整理好了",
    ctaLead: "想要这份入住清单，评论区打",
  },
  {
    id: "catering",
    label: "餐饮",
    match: /餐饮|餐厅|饭店|小吃|火锅|烧烤|咖啡|茶馆|面馆/,
    hookLead: "吃",
    painLead: ["跟着排行榜容易踩雷", "招牌菜和口味差异，只有吃过才知道"],
    proofLead: ["后厨、用料和出餐细节，眼见为实", "回头客最多点的，往往是最稳的招牌"],
    offerLead: "我整理了一份点单建议，照着点不纠结",
    ctaLead: "想要点单建议，评论区打",
  },
  {
    id: "agri",
    label: "农产品",
    match: /农产品|果园|农场|茶叶|水果|蜂蜜|山货/,
    hookLead: "挑",
    painLead: ["线上买的和实物经常不一样", "产地、时节、甜度，光看照片判断不了"],
    proofLead: ["产地实拍和采收过程，比任何文案都真", "当季现采，品质差异一眼就能看出来"],
    offerLead: "我整理了一份当季挑选指南",
    ctaLead: "想要当季指南，评论区打",
  },
  {
    id: "tandian",
    label: "探店",
    match: /探店|打卡|体验|玩乐|周边游/,
    hookLead: "逛",
    painLead: ["热门打卡点人多、排队、体验打折", "攻略越看越乱，反而不知道该去哪"],
    proofLead: ["真实体验路线，避开人群和套路", "最值得走的动线，是反复踩点才有的"],
    offerLead: "我整理了一份顺路不踩坑的动线",
    ctaLead: "想要动线清单，评论区打",
  },
  {
    id: "training",
    label: "培训",
    match: /培训|课程|辅导|教育|研学|健身/,
    hookLead: "学",
    painLead: ["试听课和正式课差距大", "老师水平、课程体系，试一次未必看得清"],
    proofLead: ["真实学员反馈比宣传更值得参考", "课程怎么教、课后怎么跟，细节见水平"],
    offerLead: "我整理了选课前的检查清单",
    ctaLead: "想要选课清单，评论区打",
  },
  {
    id: "service",
    label: "本地服务",
    match: /服务|维修|家政|摄影|美发|装修|旅行/,
    hookLead: "选",
    painLead: ["服务质量和报价，常常要到最后一刻才清楚", "低价吸引人，但售后和沟通容易被忽略"],
    proofLead: ["流程、报价、售后，提前问清比什么都重要", "真实案例和本地口碑，比广告靠谱"],
    offerLead: "我整理了确认服务前的必问清单",
    ctaLead: "想要必问清单，评论区打",
  },
];

export const matchIndustryProfile = (industry: string): IndustryProfile | undefined =>
  industryProfiles.find((profile) => profile.match.test(industry));

const templates: Array<{
  id: TemplateId;
  label: string;
  hook: (location: string, industry: string, profile?: IndustryProfile) => string;
  painLead: string;
  offerLead: string;
}> = [
  {
    id: "avoid-mistake",
    label: "避坑型",
    hook: (location) => "第一次来" + location + "，别只看价格",
    painLead: "很多人第一次选择时容易踩坑",
    offerLead: "我整理了一份不踩坑清单",
  },
  {
    id: "hidden-gem",
    label: "宝藏型",
    hook: (location, industry) => location + "这个" + industry + "，适合慢慢体验",
    painLead: "热门选择不一定最适合你",
    offerLead: "这份小众攻略可以直接收藏",
  },
  {
    id: "comparison",
    label: "对比型",
    hook: (_location, industry) => "选" + industry + "，别只看网红推荐",
    painLead: "真正影响体验的，往往是这些细节",
    offerLead: "我把判断标准整理好了",
  },
  {
    id: "checklist",
    label: "清单型",
    hook: (location) => "去" + location + "之前，先看这 3 点",
    painLead: "少做一步功课，体验可能差很多",
    offerLead: "按这份清单选，省心很多",
  },
];

export const templateInfo = templates.map(({ id, label }) => ({ id, label }));

export const toneInfo: Array<{ id: ToneId; label: string; description: string }> = [
  { id: "practical", label: "实用", description: "像攻略清单，信息密度高。" },
  { id: "warm", label: "温和", description: "像店主建议，克制不催促。" },
  { id: "direct", label: "直接", description: "开门见山，适合促销转化。" },
  { id: "story", label: "故事", description: "更像真实体验和口碑表达。" },
];

const toneCopy: Record<
  ToneId,
  {
    hookSuffix: string;
    proofPrefix: string;
    bodyLead: string;
  }
> = {
  practical: {
    hookSuffix: "先看这条实用建议",
    proofPrefix: "更推荐关注",
    bodyLead: "一条适合收藏的实用建议：",
  },
  warm: {
    hookSuffix: "可以慢慢看这一点",
    proofPrefix: "比较舒服的是",
    bodyLead: "如果你也在做选择，可以先看这一点：",
  },
  direct: {
    hookSuffix: "这点最影响体验",
    proofPrefix: "核心判断标准是",
    bodyLead: "别急着下单，先确认这一点：",
  },
  story: {
    hookSuffix: "很多回头客会提到这一点",
    proofPrefix: "真实体验里最明显的是",
    bodyLead: "很多第一次来的客人，最后都会在意这件事：",
  },
};

export const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const assetType = (asset?: string): "image" | "video" | "none" => {
  if (!asset) {
    return "none";
  }

  return [".mp4", ".mov", ".webm"].some((ext) => asset.toLowerCase().endsWith(ext))
    ? "video"
    : "image";
};

const keywordScore = (asset: string, keywords: string[]) => {
  const lower = asset.toLowerCase();
  return keywords.reduce(
    (score, keyword) => score + (lower.includes(keyword.toLowerCase()) ? 1 : 0),
    0,
  );
};

const pickAsset = (assets: string[], keywords: string[], rng: () => number) => {
  if (assets.length === 0) {
    return undefined;
  }

  const scored = assets
    .map((asset) => ({ asset, score: keywordScore(asset, keywords) }))
    .sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset));
  const top = scored.filter((item) => item.score > 0);
  const pool = (top.length > 0 ? top : scored).map((item) => item.asset);

  return pool[Math.floor(rng() * pool.length)];
};

const pick = (items: string[], rng: () => number, fallback: string) =>
  items.length > 0 ? items[Math.floor(rng() * items.length)] : fallback;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const fitDurations = (rules?: GenerationRules) => {
  const base = [3, 4, 5, 4, 4];
  const minDuration = clamp(rules?.minDuration ?? defaultGenerationRules.minDuration, 10, 60);
  const maxDuration = clamp(
    rules?.maxDuration ?? defaultGenerationRules.maxDuration,
    minDuration,
    60,
  );
  const target = clamp(Math.round((minDuration + maxDuration) / 2), 10, 60);
  const scale = target / base.reduce((sum, item) => sum + item, 0);
  const durations = base.map((duration) => clamp(Math.round(duration * scale), 2, 10));
  let diff = target - durations.reduce((sum, item) => sum + item, 0);
  let index = 0;

  while (diff !== 0 && index < 40) {
    const sceneIndex = index % durations.length;
    const next = durations[sceneIndex] + (diff > 0 ? 1 : -1);
    if (next >= 2 && next <= 10) {
      durations[sceneIndex] = next;
      diff += diff > 0 ? -1 : 1;
    }

    index += 1;
  }

  return durations;
};

const selectTemplate = (variant: number, rules?: GenerationRules) => {
  const requestedTemplates = rules?.templateIds?.length
    ? templates.filter((template) => rules.templateIds.includes(template.id))
    : templates;
  const availableTemplates = requestedTemplates.length > 0 ? requestedTemplates : templates;

  return availableTemplates[variant % availableTemplates.length];
};

export const templateForVariant = (variant: number, rules?: GenerationRules) =>
  selectTemplate(variant, rules).id;

export const draftIdOf = (template: string, variant: number) =>
  "draft-" + template + "-v" + variant;

export const buildGenerationMeta = (
  config: MerchantConfig,
  assets: string[],
  rules: GenerationRules,
  extra: { generatedAt?: string; dedupKept?: number; mode?: string } = {},
): GenerationMeta => ({
  seed: rules.seed ?? 1,
  mode: extra.mode ?? "local-rules",
  provider: "local-rules",
  model: "builtin-v2",
  promptVersion: "rules-v2",
  inputHash: stableHash(
    JSON.stringify({
      config: {
        name: config.name,
        industry: config.industry,
        location: config.location,
        sellingPoints: config.sellingPoints,
        painPoints: config.painPoints,
        proofPoints: config.proofPoints,
        offer: config.offer,
        cta: config.cta,
        hashtags: config.hashtags,
        brandStyle: config.brandStyle,
      },
      rules: {
        templateIds: rules.templateIds,
        tone: rules.tone,
        minDuration: rules.minDuration,
        maxDuration: rules.maxDuration,
        seed: rules.seed,
      },
      assets,
    }),
  ),
  industryProfile: matchIndustryProfile(config.industry)?.id,
  repairCount: 0,
  needsHumanEvidence: false,
  generatedAt: extra.generatedAt,
  dedupKept: extra.dedupKept,
});

export const buildTimeline = (
  config: MerchantConfig,
  assets: string[],
  variant: number,
  rules?: GenerationRules,
): Timeline => {
  const template = selectTemplate(variant, rules);
  const tone = toneCopy[rules?.tone ?? defaultGenerationRules.tone];
  const durations = fitDurations(rules);
  const seed = rules?.seed ?? defaultGenerationRules.seed ?? 1;
  const rng = mulberry32(seed * 7919 + variant * 104729);
  const profile = matchIndustryProfile(config.industry);
  const displayLocation = config.location.replace(/^云南/, "") || config.location;
  const firstSellingPoint = pick(config.sellingPoints, rng, "更省心的选择");
  const firstPain = pick(
    [...(profile?.painLead ?? []), ...config.painPoints],
    rng,
    template.painLead,
  );
  const firstProof = pick(
    [...(profile?.proofLead ?? []), ...config.proofPoints],
    rng,
    firstSellingPoint,
  );
  const hookAsset = pickAsset(
    assets,
    ["hero", "front", "door", "room", "product", "cover", "门头", "房间", "产品", "环境"],
    rng,
  );
  const painAsset = pickAsset(
    assets,
    ["busy", "street", "people", "detail", "痛点", "街道", "人物"],
    rng,
  );
  const proofAsset = pickAsset(
    assets,
    ["proof", "room", "yard", "view", "menu", "review", "证据", "院子", "风景", "菜品"],
    rng,
  );
  const offerAsset = pickAsset(
    assets,
    ["map", "route", "offer", "coupon", "路线", "优惠", "cta"],
    rng,
  );
  const hookLead = profile ? profile.hookLead : "第一次来";
  const hook = fitText(
    variant === 0 && config.hook
      ? config.hook
      : template.hook(displayLocation, config.industry, profile) || hookLead + displayLocation,
    HEADLINE_MAX,
  );
  const keyword = config.keyword || displayLocation || "攻略";
  const ctaPool: string[] = [
    config.cta ?? "",
    profile ? profile.ctaLead + "“" + keyword + "”" : "",
    "想要完整攻略，评论区打“" + keyword + "”",
    "评论区回复“" + keyword + "”，领取整理好的清单",
    config.cta ? config.cta.replace(/“/, "“" + keyword + "”") : "",
  ].filter((item) => item.trim().length > 0);
  const cta = fitText(pick(ctaPool, rng, config.cta || "评论区领取完整清单"), 60);
  const proofHeadline = fitText(firstProof, HEADLINE_MAX);
  const painHeadline = fitText(firstPain, HEADLINE_MAX);
  const offerHeadline = fitText(config.offer ?? profile?.offerLead ?? "评论区领取完整清单", 32);
  const brandSuffix = config.brandStyle ? "｜" + config.brandStyle : "";

  const scenes: Scene[] = [
    {
      id: "hook",
      type: "hook",
      duration: durations[0],
      headline: hook,
      subtitle: fitText(config.audience + tone.hookSuffix, SUBTITLE_MAX),
      badge: "3秒钩子",
      color: "#ffdd2d",
      asset: hookAsset,
      assetType: assetType(hookAsset),
    },
    {
      id: "pain",
      type: "pain",
      duration: durations[1],
      headline: painHeadline,
      subtitle: fitText(template.painLead, SUBTITLE_MAX),
      badge: "痛点",
      color: "#ff7a59",
      asset: painAsset,
      assetType: assetType(painAsset),
    },
    {
      id: "proof",
      type: "proof",
      duration: durations[2],
      headline: proofHeadline,
      subtitle: fitText(
        tone.proofPrefix +
          "：" +
          (config.sellingPoints.slice(0, 3).join(" · ") || firstSellingPoint),
        SUBTITLE_MAX,
      ),
      badge: "证据",
      color: "#4ade80",
      asset: proofAsset,
      assetType: assetType(proofAsset),
    },
    {
      id: "offer",
      type: "offer",
      duration: durations[3],
      headline: offerHeadline,
      subtitle: fitText(profile?.offerLead ?? template.offerLead, SUBTITLE_MAX),
      badge: "价值",
      color: "#60a5fa",
      asset: offerAsset,
      assetType: assetType(offerAsset),
    },
    {
      id: "cta",
      type: "cta",
      duration: durations[4],
      headline: cta,
      subtitle: fitText(config.name + "｜" + config.location + brandSuffix, SUBTITLE_MAX),
      badge: "转化",
      color: "#c084fc",
      asset: hookAsset,
      assetType: assetType(hookAsset),
    },
  ];

  const bodyLines = [
    config.name + "给" + config.audience + "的" + tone.bodyLead + painHeadline,
    tone.proofPrefix +
      "：" +
      (config.sellingPoints.slice(0, 3).join("、") || firstSellingPoint) +
      "。",
    cta,
  ];
  const bodyText = bodyLines.join("\n");
  const body = bodyText.length > BODY_MAX ? bodyText.slice(0, BODY_MAX - 1) + "…" : bodyText;

  return {
    schemaVersion: SCHEMA_VERSION,
    draftId: draftIdOf(template.id, variant),
    title: fitText(config.name + " - " + template.label + "短视频草稿", TITLE_MAX),
    template: template.id,
    format: "9:16",
    fps: 30,
    width: 1080,
    height: 1920,
    merchant: {
      name: config.name,
      industry: config.industry,
      location: config.location,
      audience: config.audience,
      offer: config.offer,
    },
    musicHint: config.musicHint,
    scenes,
    publishCopy: {
      title: fitText(scenes[0].headline, TITLE_MAX),
      body,
      hashtags: config.hashtags,
      commentPrompt: cta,
    },
    reviewState: "pending",
    generationMeta: buildGenerationMeta(config, assets, rules ?? defaultGenerationRules),
  };
};

export const draftFingerprint = (draft: Timeline) =>
  JSON.stringify({
    template: draft.template,
    hook: draft.scenes[0]?.headline,
    pain: draft.scenes[1]?.headline,
    proof: draft.scenes[2]?.headline,
    offer: draft.scenes[3]?.headline,
    cta: draft.scenes[4]?.headline,
    order: draft.scenes.map((scene) => scene.asset ?? "").join("|"),
  });

export const buildDrafts = (
  config: MerchantConfig,
  assets: string[],
  count = defaultGenerationRules.count,
  rules?: GenerationRules,
  variants?: number[],
) => {
  return Array.from({ length: count }, (_, index) =>
    buildTimeline(config, assets, variants?.[index] ?? index, rules),
  );
};

export const buildDraftsDistinct = (
  config: MerchantConfig,
  assets: string[],
  count = defaultGenerationRules.count,
  rules?: GenerationRules,
): { drafts: Timeline[]; dedupKept: number; totalAttempts: number } => {
  const seed = rules?.seed ?? defaultGenerationRules.seed ?? 1;
  const base = seed * 1000;
  const seen = new Set<string>();
  const drafts: Timeline[] = [];
  const limit = Math.max(count * 8, 32);

  for (let attempt = 0; attempt < limit && drafts.length < count; attempt += 1) {
    const variant = base + attempt;
    const draft = buildTimeline(config, assets, variant, rules);
    const fingerprint = draftFingerprint(draft);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    drafts.push(draft);
  }

  return {
    drafts,
    dedupKept: drafts.length,
    totalAttempts: limit,
  };
};

export const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  hook: "钩子",
  pain: "痛点",
  proof: "证据",
  offer: "价值",
  cta: "转化",
};
