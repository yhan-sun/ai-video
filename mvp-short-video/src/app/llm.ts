import {
  DraftProposalSchema,
  SCHEMA_VERSION,
  type DraftProposal,
  type GenerationMeta,
  type GenerationRules,
  type MerchantConfig,
  type Timeline,
} from "../contract/schema.ts";
import { stableHash } from "./format.ts";
import { draftIdOf, fitText, HEADLINE_MAX, TITLE_MAX } from "./timeline.ts";
import type { LLMConfig } from "./types.ts";

export const PROMPT_VERSION = "draft-proposal-v1";
export const MAX_REPAIRS = 2;
export const MAX_PROPOSALS_PER_CALL = 5;

export type LLMGenerateInput = {
  config: MerchantConfig;
  assets: string[];
  rules: GenerationRules;
  count: number;
};

export type LLMTrace = {
  provider: string;
  model?: string;
  promptVersion: string;
  inputHash: string;
  generatedAt: string;
  repairCount: number;
  needsHumanEvidence: boolean;
  evidenceNotes?: string;
};

export type LLMGenerateResult = {
  proposals: DraftProposal[];
  trace: LLMTrace;
  error?: string;
};

export const llmInputHash = (input: LLMGenerateInput) =>
  stableHash(
    JSON.stringify({
      config: input.config,
      rules: input.rules,
      assets: input.assets,
      count: input.count,
    }),
  );

export const buildDraftProposalPrompt = (input: LLMGenerateInput) => {
  const system =
    "你是本地商家的短视频草稿策划。你只输出 JSON，禁止输出 Markdown、代码或解释。" +
    "你必须严格遵守以下事实规则：" +
    "1. 不得虚构价格、优惠金额、销量、评价、距离或效果；这些信息来自商家资料，资料里没有就不得编造。" +
    "2. 如果草稿需要价格、优惠、销量、评价、距离或效果等事实性证据，但商家资料里没有，必须把 needsHumanEvidence 设为 true，并在 evidenceNotes 里写清楚缺什么。" +
    "3. 你只输出 DraftProposal 结构，不输出任何视频剪辑代码、特效代码或 Remotion 代码。" +
    "4. 每条草稿在选题角度、钩子、场景结构、证据策略、素材顺序、CTA 和发布文案上要与其他草稿有明显差异。" +
    "5. 文本长度约束：publishCopy.title 不超过 34 字，场景 headline 不超过 32 字，subtitle 不超过 60 字，publishCopy.body 不超过 200 字。" +
    "6. scenes 用 5 个分镜，type 依次为 hook、pain、proof、offer、cta，duration 总和在规则区间内。" +
    "输出 JSON 结构：{angle, hook, pain, proof, offer, cta, needsHumanEvidence, evidenceNotes, publishCopy: {title, body, hashtags, commentPrompt}, scenes: [{type, headline, subtitle, duration}]}";

  const user =
    "商家资料：\n" +
    JSON.stringify(
      {
        name: input.config.name,
        industry: input.config.industry,
        location: input.config.location,
        region: input.config.region,
        audience: input.config.audience,
        sellingPoints: input.config.sellingPoints,
        painPoints: input.config.painPoints,
        proofPoints: input.config.proofPoints,
        offer: input.config.offer,
        cta: input.config.cta,
        hashtags: input.config.hashtags,
        brandStyle: input.config.brandStyle,
      },
      null,
      2,
    ) +
    "\n\n本机素材（相对路径）：\n" +
    (input.assets.length > 0 ? input.assets.join("\n") : "（暂无素材，全部用占位）") +
    "\n\n规则：数量 " +
    input.count +
    " 条；模板 " +
    input.rules.templateIds.join("、") +
    "；语气 " +
    input.rules.tone +
    "；时长 " +
    input.rules.minDuration +
    "-" +
    input.rules.maxDuration +
    " 秒。" +
    "\n\n请输出 " +
    input.count +
    " 条草稿，作为 JSON 数组返回。";

  return { system, user };
};

const stripCodeFence = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    return fenced[1].trim();
  }
  return trimmed;
};

export { stripCodeFence };

const parseProposalArray = (raw: unknown): DraftProposal[] => {
  if (Array.isArray(raw)) {
    return raw.map((item) => DraftProposalSchema.parse(item));
  }
  if (raw && typeof raw === "object" && "proposals" in raw && Array.isArray(raw.proposals)) {
    return raw.proposals.map((item) => DraftProposalSchema.parse(item));
  }
  if (raw && typeof raw === "object" && "angle" in raw) {
    return [DraftProposalSchema.parse(raw)];
  }
  throw new Error("模型输出不是草稿数组。");
};

const parseModelContent = (content: string, repairErrors: string[] = []) => {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error("模型输出不是有效 JSON。");
  }
  try {
    return parseProposalArray(json);
  } catch (error) {
    repairErrors.push(error instanceof Error ? error.message : String(error));
    throw error;
  }
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const requestChatCompletion = async (
  llmConfig: LLMConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> => {
  const baseUrl = llmConfig.baseUrl.replace(/\/$/, "");
  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + llmConfig.apiKey,
    },
    body: JSON.stringify({
      model: llmConfig.model || "gpt-4o-mini",
      messages,
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      "LLM 请求失败（HTTP " +
        response.status +
        "）：" +
        (detail.slice(0, 200) || response.statusText),
    );
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM 响应不是有效对象。");
  }
  const record = payload as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("LLM 响应缺少 choices。");
  }
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("LLM 响应缺少文本内容。");
  }
  return content;
};

export const generateProposalsWithProvider = async ({
  config,
  assets,
  rules,
  count,
  llmConfig,
  signal,
}: {
  config: MerchantConfig;
  assets: string[];
  rules: GenerationRules;
  count: number;
  llmConfig: LLMConfig;
  signal?: AbortSignal;
}): Promise<LLMGenerateResult> => {
  const input: LLMGenerateInput = { config, assets, rules, count: Math.min(count, 10) };
  const trace: LLMTrace = {
    provider: llmConfig.provider,
    model: llmConfig.model || undefined,
    promptVersion: PROMPT_VERSION,
    inputHash: llmInputHash(input),
    generatedAt: new Date().toISOString(),
    repairCount: 0,
    needsHumanEvidence: false,
  };

  const { system, user } = buildDraftProposalPrompt(input);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    let content = await requestChatCompletion(llmConfig, messages, signal);
    const repairErrors: string[] = [];

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt += 1) {
      try {
        const proposals = parseModelContent(content, repairErrors).slice(0, count);
        trace.repairCount = attempt;
        trace.needsHumanEvidence = proposals.some((proposal) => proposal.needsHumanEvidence);
        const withEvidence = proposals.find((proposal) => proposal.needsHumanEvidence);
        trace.evidenceNotes = withEvidence?.evidenceNotes;
        return { proposals, trace };
      } catch (error) {
        if (attempt >= MAX_REPAIRS) {
          throw new Error(
            "模型输出经过 " +
              (attempt + 1) +
              " 次尝试（含 " +
              attempt +
              " 次修复）仍未通过契约校验：" +
              (error instanceof Error ? error.message : String(error)),
            { cause: error },
          );
        }
        trace.repairCount = attempt + 1;
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content:
            "上次输出未通过契约校验：" +
            (repairErrors.at(-1) ?? String(error)) +
            "。请只输出符合 DraftProposal 结构的 JSON 数组，不要加任何其他文字。",
        });
        content = await requestChatCompletion(llmConfig, messages, signal);
      }
    }

    throw new Error("模型输出经过 " + MAX_REPAIRS + " 次修复仍未通过契约校验。");
  } catch (error) {
    return {
      proposals: [],
      trace,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const proposalToTimeline = (
  proposal: DraftProposal,
  config: MerchantConfig,
  assets: string[],
  rules: GenerationRules,
  variant: number,
  trace?: LLMTrace,
): Timeline => {
  const usedIds = new Set<string>();

  const scenes = proposal.scenes.map((scene) => {
    let id = scene.type;
    let suffix = 1;
    while (usedIds.has(id)) {
      suffix += 1;
      id = scene.type + suffix;
    }
    usedIds.add(id);

    const preferred = sceneAssetKeywords(scene.type);
    const asset = pickAssetByKeywords(assets, preferred, variant + suffix);
    const assetType: "image" | "video" | "none" = !asset
      ? "none"
      : [".mp4", ".mov", ".webm"].some((ext) => asset.toLowerCase().endsWith(ext))
        ? "video"
        : "image";
    return {
      id,
      type: scene.type,
      duration: Math.max(1, Math.min(10, Math.round(scene.duration))),
      headline: fitText(scene.headline, HEADLINE_MAX),
      subtitle: scene.subtitle ? fitText(scene.subtitle, 60) : undefined,
      asset,
      assetType,
      badge: sceneBadge(scene.type),
      color: sceneColor(scene.type),
    };
  });

  const generationMeta: GenerationMeta = {
    seed: rules.seed ?? 1,
    mode: "llm",
    provider: trace?.provider ?? "llm",
    model: trace?.model,
    promptVersion: trace?.promptVersion ?? PROMPT_VERSION,
    inputHash: trace?.inputHash,
    generatedAt: trace?.generatedAt ?? new Date().toISOString(),
    repairCount: trace?.repairCount ?? 0,
    needsHumanEvidence: proposal.needsHumanEvidence || Boolean(trace?.needsHumanEvidence),
    evidenceNotes: proposal.evidenceNotes ?? trace?.evidenceNotes,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    draftId: draftIdOf(proposal.template ?? rules.templateIds[0] ?? "checklist", variant),
    title: fitText(proposal.publishCopy.title, TITLE_MAX),
    template: proposal.template ?? rules.templateIds[0] ?? "checklist",
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
      title: fitText(proposal.publishCopy.title, TITLE_MAX),
      body: fitText(proposal.publishCopy.body, 200),
      hashtags: proposal.publishCopy.hashtags,
      commentPrompt: proposal.publishCopy.commentPrompt,
    },
    reviewState: "pending",
    sourceProposal: proposal,
    generationMeta,
  };
};

export const localProposals = (
  input: LLMGenerateInput,
  drafts: Timeline[],
): { proposals: DraftProposal[]; trace: LLMTrace } => {
  const trace: LLMTrace = {
    provider: "local-rules",
    model: "builtin-v2",
    promptVersion: "rules-v2",
    inputHash: llmInputHash(input),
    generatedAt: new Date().toISOString(),
    repairCount: 0,
    needsHumanEvidence: false,
  };

  const proposals: DraftProposal[] = drafts.map((draft) => ({
    angle: draft.template + "：" + draft.scenes[0]?.headline.slice(0, 20),
    hook: draft.scenes[0]?.headline ?? "",
    pain: draft.scenes[1]?.headline ?? "",
    proof: draft.scenes[2]?.headline ?? "",
    offer: draft.scenes[3]?.headline ?? "",
    cta: draft.scenes[4]?.headline ?? "",
    needsHumanEvidence: false,
    state: "draft",
    publishCopy: {
      title: draft.publishCopy.title,
      body: draft.publishCopy.body,
      hashtags: draft.publishCopy.hashtags,
      commentPrompt: draft.publishCopy.commentPrompt,
    },
    scenes: draft.scenes.map((scene) => ({
      type: scene.type,
      headline: scene.headline,
      subtitle: scene.subtitle,
      duration: scene.duration,
    })),
    template: draft.template as "avoid-mistake" | "hidden-gem" | "comparison" | "checklist",
  }));

  return { proposals, trace };
};

export const traceToGenerationMeta = (
  trace: LLMTrace,
  extra: { seed?: number; dedupKept?: number; industryProfile?: string } = {},
): GenerationMeta => ({
  seed: extra.seed ?? 1,
  mode: "llm",
  provider: trace.provider,
  model: trace.model,
  promptVersion: trace.promptVersion,
  inputHash: trace.inputHash,
  generatedAt: trace.generatedAt,
  repairCount: trace.repairCount,
  needsHumanEvidence: trace.needsHumanEvidence,
  evidenceNotes: trace.evidenceNotes,
  industryProfile: extra.industryProfile,
  dedupKept: extra.dedupKept,
});

const sceneBadge = (type: string) => {
  const labels: Record<string, string> = {
    hook: "3秒钩子",
    pain: "痛点",
    proof: "证据",
    offer: "价值",
    cta: "转化",
  };
  return labels[type] ?? type;
};

const sceneColor = (type: string) => {
  const colors: Record<string, string> = {
    hook: "#ffdd2d",
    pain: "#ff7a59",
    proof: "#4ade80",
    offer: "#60a5fa",
    cta: "#c084fc",
  };
  return colors[type] ?? "#ffdd2d";
};

const sceneAssetKeywords = (type: string) => {
  const keywords: Record<string, string[]> = {
    hook: ["hero", "front", "door", "room", "环境", "门头"],
    pain: ["busy", "street", "people", "痛点", "人物"],
    proof: ["proof", "review", "menu", "yard", "view", "证据", "菜品", "院子"],
    offer: ["map", "route", "offer", "coupon", "路线", "优惠"],
    cta: ["cta", "map", "route", "二维码", "优惠"],
  };
  return keywords[type] ?? [];
};

const keywordScore = (asset: string, keywords: string[]) => {
  const lower = asset.toLowerCase();
  return keywords.reduce(
    (score, keyword) => score + (lower.includes(keyword.toLowerCase()) ? 1 : 0),
    0,
  );
};

export const pickAssetByKeywords = (
  assets: string[],
  keywords: string[],
  offset = 0,
): string | undefined => {
  if (assets.length === 0) {
    return undefined;
  }
  const scored = assets
    .map((asset) => ({ asset, score: keywordScore(asset, keywords) }))
    .sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset));
  const top = scored.filter((item) => item.score > 0);
  const pool = (top.length > 0 ? top : scored).map((item) => item.asset);
  return pool[offset % pool.length];
};
