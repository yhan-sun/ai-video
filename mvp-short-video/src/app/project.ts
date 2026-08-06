import { MerchantConfigSchema, type MerchantConfig } from "../contract/schema.ts";
import type { PersistedWorkspace } from "./state/workspace.ts";
import { listToText, tagTextToList, textToList } from "./format.ts";

export type ImportResult = {
  ok: boolean;
  config?: MerchantConfig;
  error?: string;
};

export const merchantConfigFromWorkspace = (workspace: PersistedWorkspace): MerchantConfig => ({
  name: workspace.name,
  industry: workspace.industry,
  location: workspace.location,
  region: workspace.region,
  audience: workspace.audience,
  assetsDir: "public/assets",
  keyword: workspace.keyword,
  hook: workspace.hook,
  sellingPoints: textToList(workspace.sellingPoints),
  painPoints: textToList(workspace.painPoints),
  proofPoints: textToList(workspace.proofPoints),
  offer: workspace.offer,
  cta: workspace.cta,
  musicHint: "轻快旅行 / 80-100 BPM / 清爽不吵",
  hashtags: tagTextToList(workspace.hashtags),
  brandStyle: workspace.brandStyle,
});

export const parseMerchantConfig = (text: string): ImportResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "导入失败：文件不是有效 JSON。" };
  }

  const result = MerchantConfigSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join(".") || "结构";
    return {
      ok: false,
      error:
        "导入失败：字段“" +
        field +
        "”不符合商家配置契约" +
        (first?.message ? "（" + first.message + "）" : "") +
        "。",
    };
  }

  return { ok: true, config: result.data };
};

export const applyMerchantConfigToWorkspace = (
  workspace: PersistedWorkspace,
  config: MerchantConfig,
): PersistedWorkspace => ({
  ...workspace,
  name: config.name,
  industry: config.industry,
  location: config.location,
  region: config.region ?? "",
  audience: config.audience,
  keyword: config.keyword ?? "",
  hook: config.hook ?? "",
  sellingPoints: listToText(config.sellingPoints),
  painPoints: listToText(config.painPoints),
  proofPoints: listToText(config.proofPoints),
  offer: config.offer ?? "",
  cta: config.cta ?? "",
  hashtags: config.hashtags.join(" "),
  brandStyle: config.brandStyle ?? "",
  selectedDraftId: "",
  draftEdits: {},
  draftHistory: {},
  editHistory: {},
  editHistoryIndex: {},
});

export const merchantConfigFileName = (config: MerchantConfig) => {
  const safeName = (config.name || "merchant").replace(/[^\w\u4e00-\u9fa5-]+/g, "-");
  return "merchant-config-" + safeName + ".json";
};

export const configAsJson = (config: MerchantConfig) => JSON.stringify(config, null, 2);
