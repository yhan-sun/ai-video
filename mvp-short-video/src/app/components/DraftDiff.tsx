import { useMemo } from "react";
import type { Timeline } from "../../contract/schema.ts";
import { buildDraftDiff, changedFieldLabel, type DraftDiff } from "../diff.ts";
import { assetFileName, normalizeAssetPath } from "../format.ts";
import { sceneLabel, templateLabel } from "../types.ts";
import { StatusBadge } from "./ui.tsx";

const DraftRow = ({ draft, index }: { draft: Timeline; index: number }) => (
  <option value={index}>
    {String(index + 1).padStart(2, "0")} {templateLabel[draft.template] ?? draft.template} ·{" "}
    {draft.publishCopy.title.slice(0, 18)}
  </option>
);

const ChangedCell = ({ value, changed }: { value: string; changed: boolean }) => (
  <span className={changed ? "diffChanged" : undefined}>{value || "—"}</span>
);

const DiffField = ({
  label,
  a,
  b,
  changed,
}: {
  label: string;
  a: string;
  b: string;
  changed: boolean;
}) => (
  <div className="diffRow">
    <span className="diffFieldLabel">{label}</span>
    <ChangedCell value={a} changed={changed} />
    <ChangedCell value={b} changed={changed} />
  </div>
);

export const DraftDiffPanel = ({
  drafts,
  indexA,
  indexB,
  onSetA,
  onSetB,
  onGoToDraft,
  onToggleReview,
  reviewStates,
}: {
  drafts: Timeline[];
  indexA: number;
  indexB: number;
  onSetA: (index: number) => void;
  onSetB: (index: number) => void;
  onGoToDraft: (index: number) => void;
  onToggleReview: () => void;
  reviewStates: Array<"approved" | "pending">;
}) => {
  const a = drafts[indexA] ?? drafts[0];
  const b = drafts[indexB] ?? drafts[1] ?? drafts[0];
  const diff: DraftDiff = useMemo(() => buildDraftDiff(a, b), [a, b]);

  return (
    <section className="panel viewPanel diffPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">差异对比</p>
          <h2>草稿 A / B 审校</h2>
          <p>逐分镜对比文案、素材与时长，快速定位两条候选草稿的差别并决定保留哪条。</p>
        </div>
        <StatusBadge tone={diff.identical ? "success" : "warning"}>
          {diff.identical
            ? "两份草稿完全一致"
            : diff.changedFieldCount + " 处差异 · " + diff.changedScenes + " 个分镜有变化"}
        </StatusBadge>
      </div>

      <div className="diffSelectors">
        <label className="diffSelector">
          <span>草稿 A</span>
          <select value={indexA} onChange={(event) => onSetA(Number(event.target.value))}>
            {drafts.map((draft, index) => (
              <DraftRow key={draft.draftId ?? index} draft={draft} index={index} />
            ))}
          </select>
        </label>
        <label className="diffSelector">
          <span>草稿 B</span>
          <select value={indexB} onChange={(event) => onSetB(Number(event.target.value))}>
            {drafts.map((draft, index) => (
              <DraftRow key={draft.draftId ?? index} draft={draft} index={index} />
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
          </strong>
        </article>
      </div>

      <div className="diffPublish">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">发布文案</p>
            <h2>标题 / 正文 / CTA / 标签</h2>
          </div>
        </div>
        <DiffField
          label="标题"
          a={a.publishCopy.title}
          b={b.publishCopy.title}
          changed={diff.publish.titleChanged}
        />
        <DiffField
          label="正文"
          a={a.publishCopy.body}
          b={b.publishCopy.body}
          changed={diff.publish.bodyChanged}
        />
        <DiffField
          label="CTA"
          a={a.publishCopy.commentPrompt}
          b={b.publishCopy.commentPrompt}
          changed={diff.publish.commentPromptChanged}
        />
        <DiffField
          label="标签"
          a={a.publishCopy.hashtags.join(" ")}
          b={b.publishCopy.hashtags.join(" ")}
          changed={diff.publish.hashtagsChanged}
        />
      </div>

      <div className="diffScenes">
        {diff.sceneDiffs.map((scene) => {
          const changed = scene.changed;
          const isChanged = changed.length > 0 || scene.missingInB;
          return (
            <article className={"diffScene" + (isChanged ? " changed" : "")} key={scene.sceneId}>
              <div className="diffSceneHead">
                <strong>
                  {sceneLabel[scene.typeA ?? "hook"]}
                  {scene.missingInB ? "（B 中已删除）" : ""}
                </strong>
                <div className="diffSceneTags">
                  {changed.map((field) => (
                    <StatusBadge key={field} tone="warning">
                      {changedFieldLabel[field]}
                    </StatusBadge>
                  ))}
                  {!isChanged ? <StatusBadge tone="success">一致</StatusBadge> : null}
                </div>
              </div>
              <div className="diffRow">
                <span className="diffFieldLabel">画面大字</span>
                <ChangedCell value={scene.headlineA ?? ""} changed={changed.includes("headline")} />
                <ChangedCell value={scene.headlineB ?? ""} changed={changed.includes("headline")} />
              </div>
              <div className="diffRow">
                <span className="diffFieldLabel">辅助文案</span>
                <ChangedCell value={scene.subtitleA ?? ""} changed={changed.includes("subtitle")} />
                <ChangedCell value={scene.subtitleB ?? ""} changed={changed.includes("subtitle")} />
              </div>
              <div className="diffRow">
                <span className="diffFieldLabel">时长</span>
                <ChangedCell
                  value={String(scene.durationA ?? 0) + "s"}
                  changed={changed.includes("duration")}
                />
                <ChangedCell
                  value={String(scene.durationB ?? 0) + "s"}
                  changed={changed.includes("duration")}
                />
              </div>
              <div className="diffRow">
                <span className="diffFieldLabel">素材</span>
                <ChangedCell
                  value={scene.assetA ? assetFileName(normalizeAssetPath(scene.assetA)) : "占位"}
                  changed={changed.includes("asset")}
                />
                <ChangedCell
                  value={scene.assetB ? assetFileName(normalizeAssetPath(scene.assetB)) : "占位"}
                  changed={changed.includes("asset")}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
