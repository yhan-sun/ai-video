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

const MergeButton = ({
  sourceIndex,
  targetIndex,
  sceneId,
  field,
  disabled,
  onMerge,
}: {
  sourceIndex: number;
  targetIndex: number;
  sceneId: string | null;
  field: DiffMergeField;
  disabled?: boolean;
  onMerge: (
    sourceIndex: number,
    targetIndex: number,
    sceneId: string | null,
    field: DiffMergeField,
  ) => void;
}) => (
  <button
    type="button"
    className="linkButton mergeButton"
    disabled={disabled}
    onClick={() => onMerge(sourceIndex, targetIndex, sceneId, field)}
  >
    B→A
  </button>
);

const FieldCell = ({ value, changed }: { value: string; changed: boolean }) => (
  <span className={changed ? "diffChanged" : undefined}>{value || "—"}</span>
);

const PublishRow = ({
  label,
  a,
  b,
  c,
  field,
  aChanged,
  cChanged,
  indexA,
  indexB,
  indexC,
  onMerge,
}: {
  label: string;
  a: string;
  b: string;
  c?: string;
  field: DiffMergeField;
  aChanged: boolean;
  cChanged: boolean;
  indexA: number;
  indexB: number;
  indexC: number | null;
  onMerge: (
    sourceIndex: number,
    targetIndex: number,
    sceneId: string | null,
    field: DiffMergeField,
  ) => void;
}) => (
  <div className="diffRow">
    <span className="diffFieldLabel">{label}</span>
    <FieldCell value={a} changed={false} />
    <FieldCell value={b} changed={aChanged} />
    {indexC !== null ? <FieldCell value={c ?? "—"} changed={cChanged} /> : null}
    <div className="diffRowActions">
      <MergeButton
        sourceIndex={indexB}
        targetIndex={indexA}
        sceneId={null}
        field={field}
        disabled={!aChanged}
        onMerge={onMerge}
      />
      {indexC !== null ? (
        <MergeButton
          sourceIndex={indexC}
          targetIndex={indexA}
          sceneId={null}
          field={field}
          disabled={!cChanged}
          onMerge={onMerge}
        />
      ) : null}
    </div>
  </div>
);

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
  indexA,
  indexB,
  indexC,
  onSetA,
  onSetB,
  onSetC,
  onGoToDraft,
  onToggleReview,
  onMerge,
  reviewStates,
}: {
  drafts: Timeline[];
  indexA: number;
  indexB: number;
  indexC: number | null;
  onSetA: (index: number) => void;
  onSetB: (index: number) => void;
  onSetC: (index: number | null) => void;
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
  const a = drafts[indexA] ?? drafts[0];
  const b = drafts[indexB] ?? drafts[1] ?? drafts[0];
  const c = indexC !== null ? drafts[indexC] : undefined;
  const diff = useMemo(() => buildDraftDiff(a, b), [a, b]);
  const cDiff = useMemo(() => (c ? buildDraftDiff(a, c) : null), [a, c]);

  const cSceneMap = useMemo(
    () => new Map((c?.scenes ?? []).map((scene) => [scene.id, scene])),
    [c],
  );
  const cPublish = cDiff?.publish;

  const publishDiff = diff.publish;

  return (
    <section className="panel viewPanel diffPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">差异对比</p>
          <h2>草稿 A / B{indexC !== null ? " / C" : ""} 审校</h2>
          <p>
            逐分镜对比文案、素材与时长，用"B→A"（或"C→A"）把任意字段合并回草稿 A，再决定保留哪条。
          </p>
        </div>
        <StatusBadge tone={diff.identical && !cDiff ? "success" : "warning"}>
          {diff.identical && !cDiff ? "A / B 完全一致" : diff.changedFieldCount + " 处 A/B 差异"}
        </StatusBadge>
      </div>

      <div className="diffSelectors">
        <label className="diffSelector">
          <span>草稿 A</span>
          <select value={indexA} onChange={(event) => onSetA(Number(event.target.value))}>
            {drafts.map((draft, index) => (
              <DraftOption key={draft.draftId ?? index} draft={draft} index={index} />
            ))}
          </select>
        </label>
        <label className="diffSelector">
          <span>草稿 B</span>
          <select value={indexB} onChange={(event) => onSetB(Number(event.target.value))}>
            {drafts.map((draft, index) => (
              <DraftOption key={draft.draftId ?? index} draft={draft} index={index} />
            ))}
          </select>
        </label>
        <label className="diffSelector">
          <span>草稿 C</span>
          <select
            value={indexC ?? -1}
            onChange={(event) => {
              const value = Number(event.target.value);
              onSetC(value < 0 ? null : value);
            }}
          >
            <option value={-1}>不对比</option>
            {drafts.map((draft, index) => (
              <DraftOption key={draft.draftId ?? index} draft={draft} index={index} />
            ))}
          </select>
        </label>
        <div className="buttonGroup">
          <button
            type="button"
            className="secondaryButton"
            onClick={() => onSetB((indexA + 1) % drafts.length)}
          >
            下一对
          </button>
          <button type="button" className="secondaryButton" onClick={() => onGoToDraft(indexA)}>
            编辑草稿 A
          </button>
          <button type="button" className="secondaryButton" onClick={() => onGoToDraft(indexB)}>
            编辑草稿 B
          </button>
          {indexC !== null ? (
            <button type="button" className="secondaryButton" onClick={() => onGoToDraft(indexC)}>
              编辑草稿 C
            </button>
          ) : null}
          <button
            type="button"
            className={reviewStates[indexA] === "approved" ? "primaryButton" : "secondaryButton"}
            onClick={onToggleReview}
          >
            {reviewStates[indexA] === "approved" ? "撤销 A 的审核通过" : "标记 A 审核通过"}
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
            A {reviewStates[indexA] === "approved" ? "已通过" : "待审核"} · B{" "}
            {reviewStates[indexB] === "approved" ? "已通过" : "待审核"}
            {indexC !== null
              ? " · C " + (reviewStates[indexC] === "approved" ? "已通过" : "待审核")
              : ""}
          </strong>
        </article>
      </div>

      <div className="diffPublish">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">发布文案</p>
            <h2>标题 / 正文 / CTA / 标签</h2>
          </div>
          <span className="diffRowHint">B→A / C→A 会把该字段合并进草稿 A</span>
        </div>
        <PublishRow
          label="标题"
          a={a.publishCopy.title}
          b={b.publishCopy.title}
          c={c?.publishCopy.title}
          field="title"
          aChanged={publishDiff.titleChanged}
          cChanged={Boolean(cPublish?.titleChanged)}
          indexA={indexA}
          indexB={indexB}
          indexC={indexC}
          onMerge={onMerge}
        />
        <PublishRow
          label="正文"
          a={a.publishCopy.body}
          b={b.publishCopy.body}
          c={c?.publishCopy.body}
          field="body"
          aChanged={publishDiff.bodyChanged}
          cChanged={Boolean(cPublish?.bodyChanged)}
          indexA={indexA}
          indexB={indexB}
          indexC={indexC}
          onMerge={onMerge}
        />
        <PublishRow
          label="CTA"
          a={a.publishCopy.commentPrompt}
          b={b.publishCopy.commentPrompt}
          c={c?.publishCopy.commentPrompt}
          field="commentPrompt"
          aChanged={publishDiff.commentPromptChanged}
          cChanged={Boolean(cPublish?.commentPromptChanged)}
          indexA={indexA}
          indexB={indexB}
          indexC={indexC}
          onMerge={onMerge}
        />
        <PublishRow
          label="标签"
          a={a.publishCopy.hashtags.join(" ")}
          b={b.publishCopy.hashtags.join(" ")}
          c={c?.publishCopy.hashtags.join(" ")}
          field="hashtags"
          aChanged={publishDiff.hashtagsChanged}
          cChanged={Boolean(cPublish?.hashtagsChanged)}
          indexA={indexA}
          indexB={indexB}
          indexC={indexC}
          onMerge={onMerge}
        />
      </div>

      <div className="diffScenes">
        {diff.sceneDiffs.map((sceneDiff) => {
          const sceneB = b.scenes.find((scene) => scene.id === sceneDiff.sceneId);
          const sceneC = cSceneMap.get(sceneDiff.sceneId);
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
                  {sceneC && sceneC.subtitleSource ? (
                    <StatusBadge tone="info">C 有字幕来源</StatusBadge>
                  ) : null}
                </div>
              </div>
              {(["headline", "subtitle", "duration", "asset"] as const).map((field) => (
                <div className="diffRow" key={field}>
                  <span className="diffFieldLabel">{changedFieldLabel[field]}</span>
                  <FieldCell
                    value={sceneFieldValue(
                      a.scenes.find((s) => s.id === sceneDiff.sceneId)!,
                      field,
                    )}
                    changed={false}
                  />
                  <FieldCell
                    value={sceneB ? sceneFieldValue(sceneB, field) : "—"}
                    changed={changed.includes(field)}
                  />
                  {indexC !== null ? (
                    <FieldCell
                      value={sceneC ? sceneFieldValue(sceneC, field) : "—"}
                      changed={Boolean(
                        sceneC &&
                        sceneDiffSceneChanged(
                          sceneC,
                          a.scenes.find((s) => s.id === sceneDiff.sceneId)!,
                          field,
                        ),
                      )}
                    />
                  ) : null}
                  <div className="diffRowActions">
                    <MergeButton
                      sourceIndex={indexB}
                      targetIndex={indexA}
                      sceneId={sceneDiff.sceneId}
                      field={field}
                      disabled={!sceneB || !changed.includes(field)}
                      onMerge={onMerge}
                    />
                    {indexC !== null ? (
                      <MergeButton
                        sourceIndex={indexC}
                        targetIndex={indexA}
                        sceneId={sceneDiff.sceneId}
                        field={field}
                        disabled={!sceneC}
                        onMerge={onMerge}
                      />
                    ) : null}
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

const sceneDiffSceneChanged = (candidate: Scene, base: Scene, field: DiffMergeField): boolean => {
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

export type { SceneEdit };
