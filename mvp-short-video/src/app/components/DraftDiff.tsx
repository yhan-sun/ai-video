import { useMemo } from "react";
import type { Scene, Timeline } from "../../contract/schema.ts";
import { buildDraftDiff, changedFieldLabel } from "../diff.ts";
import { assetFileName, normalizeAssetPath } from "../format.ts";
import { sceneLabel, templateLabel } from "../types.ts";
import type { SceneEdit } from "../types.ts";
import { StatusBadge } from "./ui.tsx";

export type DiffMergeField =
  | "title"
  | "body"
  | "commentPrompt"
  | "hashtags"
  | "type"
  | "headline"
  | "subtitle"
  | "duration"
  | "asset";

const DraftOption = ({ draft, index }: { draft: Timeline; index: number }) => (
  <option value={index}>
    {String(index + 1).padStart(2, "0")} {templateLabel[draft.template] ?? draft.template} ·{" "}
    {draft.publishCopy.title.slice(0, 18)}
  </option>
);

const sceneFieldChanged = (candidate: Scene, base: Scene, field: DiffMergeField): boolean => {
  if (field === "asset") {
    return normalizeAssetPath(candidate.asset ?? "") !== normalizeAssetPath(base.asset ?? "");
  }
  if (field === "headline") {
    return candidate.headline !== base.headline;
  }
  if (field === "subtitle") {
    return (candidate.subtitle ?? "") !== (base.subtitle ?? "");
  }
  if (field === "duration") {
    return candidate.duration !== base.duration;
  }
  return candidate.type !== base.type;
};

const sceneFieldValue = (scene: Scene, field: DiffMergeField): string => {
  if (field === "asset") {
    return scene.asset ? assetFileName(normalizeAssetPath(scene.asset)) : "占位";
  }
  if (field === "headline") {
    return scene.headline;
  }
  if (field === "subtitle") {
    return scene.subtitle ?? "";
  }
  if (field === "duration") {
    return String(scene.duration) + "s";
  }
  return sceneLabel[scene.type];
};

export const DraftDiffPanel = ({
  drafts,
  indexes,
  onSetIndex,
  onAddColumn,
  onRemoveColumn,
  onGoToDraft,
  onToggleReview,
  onMerge,
  reviewStates,
}: {
  drafts: Timeline[];
  indexes: number[];
  onSetIndex: (column: number, index: number) => void;
  onAddColumn: () => void;
  onRemoveColumn: (column: number) => void;
  onGoToDraft: (index: number) => void;
  onToggleReview: () => void;
  onMerge: (
    sourceIndex: number,
    targetIndex: number,
    sceneId: string | null,
    field: DiffMergeField,
  ) => void;
  reviewStates: Array<"approved" | "pending">;
}) => {
  const columns = indexes.map((draftIndex) => drafts[draftIndex]).filter(Boolean) as Timeline[];
  const a = drafts[indexes[0]] ?? drafts[0];
  const b = drafts[indexes[1]] ?? a;
  const diff = useMemo(() => buildDraftDiff(a, b), [a, b]);
  const columnCount = columns.length;
  const colCellStyle = {
    gridTemplateColumns: "88px repeat(" + columnCount + ", minmax(0, 1fr)) auto",
  };

  return (
    <section className="panel viewPanel diffPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">差异对比</p>
          <h2>草稿 A / B 审校{columnCount > 2 ? "（+" + (columnCount - 2) + "）" : ""}</h2>
          <p>并列对比任意草稿列，逐字段把任意一列合并回草稿 A（列按钮），再决定保留哪条。</p>
        </div>
        <StatusBadge tone={diff.identical ? "success" : "warning"}>
          {diff.identical ? "A / B 完全一致" : diff.changedFieldCount + " 处 A/B 差异"}
        </StatusBadge>
      </div>

      <div className="diffSelectors">
        {indexes.map((draftIndex, column) => (
          <label className="diffSelector" key={column}>
            <span>
              {column === 0
                ? "草稿 A"
                : column === 1
                  ? "草稿 B"
                  : "草稿 " + String.fromCharCode(67 + column - 2)}
            </span>
            <select
              value={draftIndex}
              onChange={(event) => onSetIndex(column, Number(event.target.value))}
            >
              {drafts.map((draft, index) => (
                <DraftOption key={draft.draftId ?? index} draft={draft} index={index} />
              ))}
            </select>
            {column > 1 ? (
              <button type="button" className="linkButton" onClick={() => onRemoveColumn(column)}>
                移除
              </button>
            ) : null}
          </label>
        ))}
        <button type="button" className="secondaryButton" onClick={onAddColumn}>
          + 添加草稿列
        </button>
        <div className="buttonGroup">
          <button
            type="button"
            className="secondaryButton"
            onClick={() => onSetIndex(1, (indexes[1] + 1) % drafts.length)}
          >
            下一对
          </button>
          {columns.map((column, index) => (
            <button
              type="button"
              className="secondaryButton"
              key={index}
              onClick={() => onGoToDraft(indexes[index])}
            >
              编辑 {index === 0 ? "A" : index === 1 ? "B" : String.fromCharCode(67 + index - 2)}
            </button>
          ))}
          <button
            type="button"
            className={
              reviewStates[indexes[0]] === "approved" ? "primaryButton" : "secondaryButton"
            }
            onClick={onToggleReview}
          >
            {reviewStates[indexes[0]] === "approved" ? "撤销 A 的审核通过" : "标记 A 审核通过"}
          </button>
        </div>
      </div>

      <div className="diffSummaryGrid">
        <article>
          <span>时长</span>
          <strong>
            {diff.totalDurationA}s → {diff.totalDurationB}s
            <small>
              {diff.durationDelta === 0
                ? "（不变）"
                : diff.durationDelta > 0
                  ? "（+" + diff.durationDelta + "s）"
                  : "（" + diff.durationDelta + "s）"}
            </small>
          </strong>
        </article>
        <article>
          <span>分镜数</span>
          <strong>
            {diff.sceneCountA} → {diff.sceneCountB}
          </strong>
        </article>
        <article>
          <span>素材更换</span>
          <strong>{diff.assetChanges} 处</strong>
        </article>
        <article>
          <span>审核状态</span>
          <strong>
            {columns
              .map(
                (column, index) =>
                  (index === 0 ? "A" : index === 1 ? "B" : String.fromCharCode(67 + index - 2)) +
                  " " +
                  (reviewStates[indexes[index]] === "approved" ? "已通过" : "待审核"),
              )
              .join(" · ")}
          </strong>
        </article>
      </div>

      <div className="diffPublish">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">发布文案</p>
            <h2>标题 / 正文 / CTA / 标签</h2>
          </div>
          <span className="diffRowHint">列按钮会把该字段合并进草稿 A</span>
        </div>
        {(["title", "body", "commentPrompt", "hashtags"] as const).map((field) => {
          const aChanged =
            field === "title"
              ? diff.publish.titleChanged
              : field === "body"
                ? diff.publish.bodyChanged
                : field === "commentPrompt"
                  ? diff.publish.commentPromptChanged
                  : diff.publish.hashtagsChanged;
          return (
            <div className="diffRow" style={colCellStyle} key={field}>
              <span className="diffFieldLabel">
                {field === "title"
                  ? "标题"
                  : field === "body"
                    ? "正文"
                    : field === "commentPrompt"
                      ? "CTA"
                      : "标签"}
              </span>
              {columns.map((column, index) => {
                const value =
                  field === "title"
                    ? column.publishCopy.title
                    : field === "body"
                      ? column.publishCopy.body
                      : field === "commentPrompt"
                        ? column.publishCopy.commentPrompt
                        : column.publishCopy.hashtags.join(" ");
                const changed =
                  index === 0
                    ? false
                    : index === 1
                      ? aChanged
                      : column.publishCopy.title !== a.publishCopy.title;
                return <FieldCell key={index} value={value} changed={changed} />;
              })}
              <div className="diffRowActions">
                {columns.map((_, index) =>
                  index === 0 ? null : (
                    <button
                      type="button"
                      className="linkButton mergeButton"
                      key={index}
                      onClick={() => onMerge(indexes[index], indexes[0], null, field)}
                    >
                      {index === 1 ? "B→A" : String.fromCharCode(67 + index - 2) + "→A"}
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="diffScenes">
        {diff.sceneDiffs.map((sceneDiff) => {
          const changed = sceneDiff.changed;
          const isChanged = changed.length > 0 || sceneDiff.missingInB;
          return (
            <article
              className={"diffScene" + (isChanged ? " changed" : "")}
              key={sceneDiff.sceneId}
            >
              <div className="diffSceneHead">
                <strong>
                  {sceneLabel[sceneDiff.typeA ?? "hook"]}
                  {sceneDiff.missingInB ? "（B 中已删除）" : ""}
                </strong>
                <div className="diffSceneTags">
                  {changed.map((field) => (
                    <StatusBadge key={field} tone="warning">
                      {changedFieldLabel[field]}
                    </StatusBadge>
                  ))}
                  {!isChanged ? <StatusBadge tone="success">A/B 一致</StatusBadge> : null}
                </div>
              </div>
              {(["headline", "subtitle", "duration", "asset"] as const).map((field) => (
                <div className="diffRow" style={colCellStyle} key={field}>
                  <span className="diffFieldLabel">{changedFieldLabel[field]}</span>
                  {columns.map((column, index) => {
                    const scene = column.scenes.find((item) => item.id === sceneDiff.sceneId);
                    const changedFlag =
                      index === 0
                        ? false
                        : index === 1
                          ? changed.includes(field)
                          : Boolean(
                              scene &&
                              sceneFieldChanged(
                                scene,
                                a.scenes.find((s) => s.id === sceneDiff.sceneId)!,
                                field,
                              ),
                            );
                    return (
                      <FieldCell
                        key={index}
                        value={scene ? sceneFieldValue(scene, field) : "—"}
                        changed={changedFlag}
                      />
                    );
                  })}
                  <div className="diffRowActions">
                    {columns.map((_, index) =>
                      index === 0 ? null : (
                        <button
                          type="button"
                          className="linkButton mergeButton"
                          key={index}
                          disabled={!columns[index].scenes.some((s) => s.id === sceneDiff.sceneId)}
                          onClick={() =>
                            onMerge(indexes[index], indexes[0], sceneDiff.sceneId, field)
                          }
                        >
                          {index === 1 ? "B→A" : String.fromCharCode(67 + index - 2) + "→A"}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const FieldCell = ({ value, changed }: { value: string; changed: boolean }) => (
  <span className={changed ? "diffChanged" : undefined}>{value || "—"}</span>
);

export type { SceneEdit };
