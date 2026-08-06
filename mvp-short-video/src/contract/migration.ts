import { SCHEMA_VERSION, TimelineSchema, type Timeline } from "./schema.ts";

export type MigrationResult<T> = {
  data: T;
  migratedFrom?: number;
  message?: string;
};

export type WorkspaceMigrationResult<T> = MigrationResult<T> & {
  legacyDraftEdits?: Record<string, unknown>;
  legacyDraftHistory?: Record<string, unknown>;
  legacySelectedIndex?: number;
  errors?: string[];
};

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const versionOf = (value: unknown, key: string): number => {
  if (!isPlainRecord(value)) {
    return 0;
  }

  const raw = value[key];
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
};

export const migrateTimeline = (value: unknown): WorkspaceMigrationResult<Timeline> => {
  if (!isPlainRecord(value)) {
    throw new Error("迁移失败：草稿 JSON 不是有效对象。");
  }

  const version = versionOf(value, "schemaVersion");
  if (version > SCHEMA_VERSION) {
    throw new Error(
      "迁移失败：草稿数据版本 " + version + " 高于当前支持的 " + SCHEMA_VERSION + "，请升级应用。",
    );
  }

  const result = TimelineSchema.parse({
    ...value,
    schemaVersion: SCHEMA_VERSION,
  });

  return {
    data: result,
    migratedFrom: version === SCHEMA_VERSION ? undefined : version,
    message:
      version === SCHEMA_VERSION
        ? undefined
        : "草稿数据已从 v" + version + " 迁移到 v" + SCHEMA_VERSION + "。",
  };
};

export const migrateExportEnvelope = (value: unknown): MigrationResult<Timeline[]> => {
  if (!isPlainRecord(value)) {
    throw new Error("迁移失败：导出数据不是有效对象。");
  }

  if (isPlainRecord(value.currentDraft)) {
    const current = migrateTimeline(value.currentDraft);
    const drafts = Array.isArray(value.drafts) ? value.drafts : [];
    const migratedDrafts = drafts.map((draft) => migrateTimeline(draft).data);

    return {
      data: [current.data, ...migratedDrafts],
      migratedFrom: current.migratedFrom,
      message: current.message,
    };
  }

  if (Array.isArray(value.drafts)) {
    const migratedDrafts = value.drafts.map((draft) => migrateTimeline(draft));
    return {
      data: migratedDrafts.map((draft) => draft.data),
      message: migratedDrafts.some((draft) => draft.message)
        ? "导出数据已迁移到新版本。"
        : undefined,
    };
  }

  if (isTimelineLike(value)) {
    const migrated = migrateTimeline(value);
    return {
      data: [migrated.data],
      migratedFrom: migrated.migratedFrom,
      message: migrated.message,
    };
  }

  throw new Error("迁移失败：导出数据中没有可渲染的草稿时间线。");
};

export const isTimelineLike = (value: unknown): boolean =>
  isPlainRecord(value) && Array.isArray(value.scenes) && isPlainRecord(value.merchant);

const toNumericEditMap = (value: unknown): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).filter(([key]) => /^\d+$/.test(key)));
};

export const migrateWorkspaceRecord = (
  value: unknown,
  currentVersion = 4,
): WorkspaceMigrationResult<Record<string, unknown>> => {
  if (!isPlainRecord(value)) {
    throw new Error("迁移失败：工作区数据不是有效对象。");
  }

  const version = versionOf(value, "workspaceVersion");
  if (version > currentVersion) {
    throw new Error(
      "迁移失败：工作区版本 " +
        version +
        " 高于当前支持的 " +
        currentVersion +
        "，请升级应用后重试。",
    );
  }

  if (version >= currentVersion) {
    return { data: value, errors: [] };
  }

  const legacyDraftEdits = toNumericEditMap(value.draftEdits);
  const legacyDraftHistory = toNumericEditMap(value.draftHistory);
  const legacySelectedIndex =
    typeof value.selectedIndex === "number" ? value.selectedIndex : undefined;

  const next: Record<string, unknown> = {
    ...value,
    workspaceVersion: currentVersion,
  };

  if (Object.keys(legacyDraftEdits).length > 0) {
    next.legacyDraftEdits = legacyDraftEdits;
  }
  if (Object.keys(legacyDraftHistory).length > 0) {
    next.legacyDraftHistory = legacyDraftHistory;
  }
  if (typeof legacySelectedIndex === "number") {
    next.legacySelectedIndex = legacySelectedIndex;
  }

  const restoredBatches = Array.isArray(value.savedBatches)
    ? value.savedBatches.filter((batch) => isPlainRecord(batch))
    : [];

  return {
    data: next,
    migratedFrom: version,
    message:
      "本地数据已从旧版本迁移：" +
      Object.keys(legacyDraftEdits).length +
      " 条草稿编辑、" +
      Object.keys(legacyDraftHistory).length +
      " 组历史、" +
      restoredBatches.length +
      " 个批次。",
    legacyDraftEdits,
    legacyDraftHistory,
    legacySelectedIndex,
    errors: [],
  };
};
