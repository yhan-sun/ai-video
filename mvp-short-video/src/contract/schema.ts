import { z } from "zod";

export const SCHEMA_VERSION = 2;
export const WORKSPACE_SCHEMA_VERSION = 4;

export const SCENE_TYPES = ["hook", "pain", "proof", "offer", "cta"] as const;
export const TEMPLATE_IDS = ["avoid-mistake", "hidden-gem", "comparison", "checklist"] as const;
export const TONE_IDS = ["practical", "warm", "direct", "story"] as const;
export const ASSET_TAGS = ["环境", "菜品", "人物", "证据", "CTA"] as const;
export const REVIEW_STATES = ["pending", "approved"] as const;
export const PROPOSAL_STATES = ["draft", "needsHumanEvidence", "ready"] as const;

export const SceneTypeSchema = z.enum(SCENE_TYPES);
export const TemplateIdSchema = z.enum(TEMPLATE_IDS);
export const ToneIdSchema = z.enum(TONE_IDS);
export const AssetTagSchema = z.enum(ASSET_TAGS);
export const ReviewStateSchema = z.enum(REVIEW_STATES);
export const ProposalStateSchema = z.enum(PROPOSAL_STATES);

export const SceneMediaSchema = z.object({
  objectFit: z.enum(["cover", "contain", "fill"]).default("cover"),
  objectPosition: z.string().default("center"),
  trimStart: z.number().min(0).optional(),
  trimEnd: z.number().min(0).optional(),
  playbackRate: z.number().min(0.25).max(4).optional(),
  volume: z.number().min(0).max(1).optional(),
  muted: z.boolean().optional(),
});

export const SubtitleSourceSchema = z.object({
  asset: z.string(),
  segmentStart: z.number().min(0),
  segmentEnd: z.number().min(0),
});

export const SceneSchema = z.object({
  id: z.string().min(1),
  type: SceneTypeSchema,
  duration: z.number().min(1).max(10),
  headline: z.string(),
  subtitle: z.string().optional(),
  asset: z.string().optional(),
  assetType: z.enum(["image", "video", "none"]).default("none"),
  badge: z.string().optional(),
  color: z.string().default("#ffdd2d"),
  media: SceneMediaSchema.optional(),
  subtitleSource: SubtitleSourceSchema.optional(),
});

export const AssetAuthorizationSchema = z.object({
  status: z.enum(["authorized", "pending", "unknown"]).default("unknown"),
  owner: z.string().optional(),
  note: z.string().optional(),
  source: z.string().optional(),
  scope: z.string().optional(),
  authorizedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const MerchantConfigSchema = z.object({
  name: z.string(),
  industry: z.string(),
  location: z.string(),
  region: z.string().optional(),
  audience: z.string(),
  assetsDir: z.string().default("public/assets"),
  keyword: z.string().optional(),
  hook: z.string().optional(),
  sellingPoints: z.array(z.string()).default([]),
  painPoints: z.array(z.string()).default([]),
  proofPoints: z.array(z.string()).default([]),
  offer: z.string().optional(),
  cta: z.string().optional(),
  musicHint: z.string().optional(),
  hashtags: z.array(z.string()).default([]),
  brandStyle: z.string().optional(),
});

export const GenerationRulesSchema = z.object({
  count: z.number().int().min(1).max(20).default(10),
  templateIds: z
    .array(TemplateIdSchema)
    .min(1)
    .default([...TEMPLATE_IDS]),
  tone: ToneIdSchema.default("practical"),
  minDuration: z.number().min(10).max(60).default(18),
  maxDuration: z.number().min(10).max(60).default(24),
  seed: z.number().int().min(0).optional(),
  industryProfile: z.string().optional(),
});

export const TranscriptSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
});

export const TranscriptSchema = z.object({
  language: z.string().optional(),
  model: z.string().optional(),
  segments: z.array(TranscriptSegmentSchema).default([]),
});

export const SourceClipSchema = z.object({
  originPath: z.string(),
  start: z.number().min(0),
  duration: z.number().min(1),
});

export const AssetMetaSchema = z.object({
  path: z.string().min(1),
  type: z.enum(["image", "video", "none"]).default("image"),
  tags: z.array(AssetTagSchema).default([]),
  authorization: AssetAuthorizationSchema.optional(),
  usedInSelected: z.number().default(0),
  usedInAll: z.number().default(0),
  hash: z.string().optional(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
  thumbnail: z.string().optional(),
  imported: z.boolean().optional(),
  duplicateOf: z.string().optional(),
  remote: z.boolean().optional(),
  sourceClip: SourceClipSchema.optional(),
  transcript: TranscriptSchema.optional(),
});

export const DraftReviewSchema = z.object({
  reviewState: ReviewStateSchema,
  reviewedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DraftProposalSceneSchema = z.object({
  type: SceneTypeSchema,
  headline: z.string().min(1).max(40),
  subtitle: z.string().max(80).optional(),
  duration: z.number().min(1).max(10),
});

export const DraftProposalSchema = z.object({
  angle: z.string().min(1).max(40),
  hook: z.string().min(1).max(40),
  pain: z.string().min(1).max(80),
  proof: z.string().min(1).max(80),
  offer: z.string().min(1).max(80),
  cta: z.string().min(1).max(60),
  evidenceNotes: z.string().max(200).optional(),
  needsHumanEvidence: z.boolean().default(false),
  state: ProposalStateSchema.default("draft"),
  publishCopy: z.object({
    title: z.string().min(1).max(34),
    body: z.string().min(1).max(400),
    hashtags: z.array(z.string()).max(12).default([]),
    commentPrompt: z.string().min(1).max(60),
  }),
  scenes: z.array(DraftProposalSceneSchema).min(4).max(8),
  template: TemplateIdSchema.optional(),
});

export const GenerationMetaSchema = z.object({
  seed: z.number().optional(),
  mode: z.string().optional(),
  provider: z.string().default("local-rules"),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  inputHash: z.string().optional(),
  generatedAt: z.string().optional(),
  repairCount: z.number().int().min(0).default(0),
  needsHumanEvidence: z.boolean().default(false),
  evidenceNotes: z.string().optional(),
  industryProfile: z.string().optional(),
  dedupKept: z.number().optional(),
});

export const ReviewMetaSchema = z.object({
  approvedContentHash: z.string().optional(),
  approvedAt: z.string().optional(),
  approvedBy: z.string().optional(),
  note: z.string().optional(),
});

export const TimelineSchema = z.object({
  schemaVersion: z.number().default(SCHEMA_VERSION),
  draftId: z.string().optional(),
  title: z.string(),
  template: z.string(),
  format: z.literal("9:16").default("9:16"),
  fps: z.number().default(30),
  width: z.number().default(1080),
  height: z.number().default(1920),
  merchant: z.object({
    name: z.string(),
    industry: z.string(),
    location: z.string(),
    audience: z.string(),
    offer: z.string().optional(),
  }),
  musicHint: z.string().optional(),
  scenes: z.array(SceneSchema).min(3).max(8),
  publishCopy: z.object({
    title: z.string(),
    body: z.string(),
    hashtags: z.array(z.string()),
    commentPrompt: z.string(),
  }),
  reviewState: ReviewStateSchema.optional(),
  reviewedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  sourceConfig: MerchantConfigSchema.optional(),
  sourceRules: GenerationRulesSchema.optional(),
  sourceProposal: DraftProposalSchema.optional(),
  generationMeta: GenerationMetaSchema.optional(),
  reviewMeta: ReviewMetaSchema.optional(),
  exportMeta: z.record(z.string(), z.unknown()).optional(),
});

export const ExportEnvelopeSchema = z.object({
  exportedAt: z.string(),
  product: z.string().default("local-merchant-short-video-draft-workbench"),
  schemaVersion: z.number().optional(),
  exportKind: z.enum(["current", "all", "approved"]).optional(),
  merchantConfig: MerchantConfigSchema.optional(),
  generationRules: GenerationRulesSchema.optional(),
  selectedDraftId: z.string().optional(),
  assetLibrary: z.array(AssetMetaSchema).default([]),
  currentDraft: TimelineSchema,
  drafts: z.array(TimelineSchema).default([]),
});

export const ExportPackageSchema = z.object({
  exportedAt: z.string(),
  product: z.literal("local-merchant-short-video-draft-workbench"),
  schemaVersion: z.number().default(SCHEMA_VERSION),
  kind: z.enum(["current", "all", "approved"]),
  merchantConfig: MerchantConfigSchema.optional(),
  generationRules: GenerationRulesSchema.optional(),
  assetManifest: z.array(AssetMetaSchema).default([]),
  reviewMeta: z.record(z.string(), ReviewMetaSchema).default({}),
  drafts: z.array(TimelineSchema).min(1),
});

export type SceneType = z.infer<typeof SceneTypeSchema>;
export type TemplateId = z.infer<typeof TemplateIdSchema>;
export type ToneId = z.infer<typeof ToneIdSchema>;
export type AssetTag = z.infer<typeof AssetTagSchema>;
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export type ProposalState = z.infer<typeof ProposalStateSchema>;
export type SceneMedia = z.infer<typeof SceneMediaSchema>;
export type SubtitleSource = z.infer<typeof SubtitleSourceSchema>;
export type AssetAuthorization = z.infer<typeof AssetAuthorizationSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
export type SourceClip = z.infer<typeof SourceClipSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type MerchantConfig = z.infer<typeof MerchantConfigSchema>;
export type GenerationRules = z.infer<typeof GenerationRulesSchema>;
export type AssetMeta = z.infer<typeof AssetMetaSchema>;
export type DraftProposal = z.infer<typeof DraftProposalSchema>;
export type DraftProposalScene = z.infer<typeof DraftProposalSceneSchema>;
export type GenerationMeta = z.infer<typeof GenerationMetaSchema>;
export type ReviewMeta = z.infer<typeof ReviewMetaSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
export type ExportEnvelope = z.infer<typeof ExportEnvelopeSchema>;
export type ExportPackage = z.infer<typeof ExportPackageSchema>;
export type DraftReview = z.infer<typeof DraftReviewSchema>;

export const parseTimeline = (value: unknown): Timeline => TimelineSchema.parse(value);
export const parseExportEnvelope = (value: unknown): ExportEnvelope =>
  ExportEnvelopeSchema.parse(value);
export const parseDraftProposal = (value: unknown): DraftProposal =>
  DraftProposalSchema.parse(value);
export const parseExportPackage = (value: unknown): ExportPackage =>
  ExportPackageSchema.parse(value);

export const isTimeline = (value: unknown): value is Timeline =>
  TimelineSchema.safeParse(value).success;

export const isExportEnvelope = (value: unknown): value is ExportEnvelope =>
  ExportEnvelopeSchema.safeParse(value).success;

export const isDraftProposal = (value: unknown): value is DraftProposal =>
  DraftProposalSchema.safeParse(value).success;

export const defaultTimeline: Timeline = {
  schemaVersion: SCHEMA_VERSION,
  title: "云南本地商家短视频草稿",
  template: "hidden-gem",
  format: "9:16",
  fps: 30,
  width: 1080,
  height: 1920,
  merchant: {
    name: "大理云上小院",
    industry: "民宿",
    location: "云南大理",
    audience: "第一次来大理的情侣和亲子游客",
    offer: "评论区回复“大理”，领取 3 天路线表",
  },
  musicHint: "轻快旅行 / 80-100 BPM / 不遮盖人声",
  scenes: [
    {
      id: "hook",
      type: "hook",
      duration: 3,
      headline: "第一次来大理，别急着订海景房",
      subtitle: "很多人忽略了更舒服的住法",
      badge: "3秒钩子",
      color: "#ffdd2d",
      assetType: "none",
    },
    {
      id: "pain",
      type: "pain",
      duration: 4,
      headline: "旺季海边吵、停车难、价格还高",
      subtitle: "亲子和情侣更需要安静、好停车、能发呆",
      badge: "痛点",
      color: "#ff7a59",
      assetType: "none",
    },
    {
      id: "proof",
      type: "proof",
      duration: 5,
      headline: "这个小院离古城近，院子能喝茶看云",
      subtitle: "适合慢节奏旅行，不用每天赶景点",
      badge: "证据",
      color: "#4ade80",
      assetType: "none",
    },
    {
      id: "offer",
      type: "offer",
      duration: 4,
      headline: "我整理了一份大理 3 天不踩坑路线",
      subtitle: "含住宿区域、拍照点和吃饭建议",
      badge: "价值",
      color: "#60a5fa",
      assetType: "none",
    },
    {
      id: "cta",
      type: "cta",
      duration: 4,
      headline: "想要路线表，评论区打“大理”",
      subtitle: "适合第一次来云南的朋友收藏",
      badge: "转化",
      color: "#c084fc",
      assetType: "none",
    },
  ],
  publishCopy: {
    title: "第一次来大理，别急着订海景房",
    body: "这条视频适合第一次来大理的朋友。旺季住宿别只看海景，安静、停车、动线也很重要。",
    hashtags: ["#云南旅游", "#大理旅行", "#民宿推荐", "#亲子游"],
    commentPrompt: "评论区回复“大理”，领取 3 天路线表。",
  },
};
