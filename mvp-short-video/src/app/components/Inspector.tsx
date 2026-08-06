import type { Scene, SceneMedia, Timeline } from "../../contract/schema.ts";
import { assetFileName, assetTypeFromPath, normalizeAssetPath, sceneTimings } from "../format.ts";
import { hasLocks } from "../analysis.ts";
import { sceneLabel, sceneTypeOptions } from "../types.ts";
import type {
  CheckItem,
  DraftAnalysis,
  DraftEdit,
  DraftLocks,
  PublishLockField,
  SavedVersion,
  SceneEdit,
  SceneLockField,
  SceneType,
  StatusBadgeTone,
} from "../types.ts";
import { exportGate } from "../export.ts";
import { CheckListPanel } from "./CheckList.tsx";
import { StoryboardPreview } from "./Storyboard.tsx";
import { EmptyMini, Field, LockButton, StatusBadge } from "./ui.tsx";

const PublishEditor = ({
  selected,
  edit,
  onUpdatePublish,
  onUpdateHashtags,
  onTogglePublishLock,
}: {
  selected: Timeline;
  edit?: DraftEdit;
  onUpdatePublish: (field: "title" | "body" | "commentPrompt", value: string) => void;
  onUpdateHashtags: (value: string) => void;
  onTogglePublishLock: (field: PublishLockField) => void;
}) => {
  const publishLocked = (field: PublishLockField) => Boolean(edit?.locks?.publish?.[field]);

  return (
    <section className="editorCard">
      <div className="editorCardHeader">
        <div>
          <p className="eyebrow">文案编辑</p>
          <h3>标题、正文、CTA、标签</h3>
        </div>
        <StatusBadge tone="info">人工审核</StatusBadge>
      </div>
      <Field
        label="视频标题"
        action={
          <LockButton
            locked={publishLocked("title")}
            onToggle={() => onTogglePublishLock("title")}
          />
        }
      >
        <input
          data-testid="publish-title"
          value={selected.publishCopy.title}
          onChange={(event) => onUpdatePublish("title", event.target.value)}
        />
      </Field>
      <Field
        label="发布正文"
        action={
          <LockButton locked={publishLocked("body")} onToggle={() => onTogglePublishLock("body")} />
        }
      >
        <textarea
          data-testid="publish-body"
          value={selected.publishCopy.body}
          onChange={(event) => onUpdatePublish("body", event.target.value)}
          rows={6}
        />
      </Field>
      <Field
        label="CTA / 评论引导"
        action={
          <LockButton
            locked={publishLocked("commentPrompt")}
            onToggle={() => onTogglePublishLock("commentPrompt")}
          />
        }
      >
        <input
          data-testid="publish-cta"
          value={selected.publishCopy.commentPrompt}
          onChange={(event) => onUpdatePublish("commentPrompt", event.target.value)}
        />
      </Field>
      <Field
        label="话题标签"
        action={
          <LockButton
            locked={publishLocked("hashtags")}
            onToggle={() => onTogglePublishLock("hashtags")}
          />
        }
      >
        <input
          data-testid="publish-hashtags"
          value={selected.publishCopy.hashtags.join(" ")}
          onChange={(event) => onUpdateHashtags(event.target.value)}
        />
      </Field>
    </section>
  );
};

const SceneMediaEditor = ({
  scene,
  onUpdateScene,
}: {
  scene: Timeline["scenes"][number];
  onUpdateScene: (sceneId: string, patch: SceneEdit) => void;
}) => {
  const media: SceneMedia = scene.media ?? { objectFit: "cover", objectPosition: "center" };

  const patchMedia = (patch: Partial<NonNullable<Scene["media"]>>) => {
    onUpdateScene(scene.id, { media: { ...media, ...patch } });
  };

  if (!scene.asset || scene.assetType === "none") {
    return null;
  }

  return (
    <div className="sceneMediaEditor">
      <div className="groupHeader">
        <strong>媒体控制</strong>
        <span>裁切、位置、trim、播放速度与原声，渲染时生效。</span>
      </div>
      <div className="sceneGrid">
        <Field label="裁切方式">
          <select
            value={media.objectFit ?? "cover"}
            onChange={(event) => patchMedia({ objectFit: event.target.value as never })}
          >
            <option value="cover">cover（铺满裁切）</option>
            <option value="contain">contain（完整显示）</option>
            <option value="fill">fill（拉伸）</option>
          </select>
        </Field>
        <Field label="画面位置">
          <select
            value={media.objectPosition ?? "center"}
            onChange={(event) => patchMedia({ objectPosition: event.target.value })}
          >
            <option value="center">居中</option>
            <option value="center top">偏上</option>
            <option value="center bottom">偏下</option>
            <option value="left center">偏左</option>
            <option value="right center">偏右</option>
          </select>
        </Field>
        {scene.assetType === "video" ? (
          <>
            <Field label="起始 trim" help="秒">
              <input
                min={0}
                type="number"
                value={media.trimStart ?? 0}
                onChange={(event) =>
                  patchMedia({ trimStart: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </Field>
            <Field label="结束 trim" help="秒">
              <input
                min={0}
                type="number"
                value={media.trimEnd ?? scene.duration}
                onChange={(event) =>
                  patchMedia({ trimEnd: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </Field>
            <Field label="播放速度" help="0.25-4x">
              <input
                min={0.25}
                max={4}
                step={0.25}
                type="number"
                value={media.playbackRate ?? 1}
                onChange={(event) =>
                  patchMedia({
                    playbackRate: Math.min(4, Math.max(0.25, Number(event.target.value) || 1)),
                  })
                }
              />
            </Field>
            <Field label="原声音量" help="0-1">
              <input
                min={0}
                max={1}
                step={0.1}
                type="number"
                value={media.volume ?? 0}
                onChange={(event) =>
                  patchMedia({
                    volume: Math.min(1, Math.max(0, Number(event.target.value) || 0)),
                  })
                }
              />
            </Field>
            <Field label="使用原声">
              <label className="checkboxLine">
                <input
                  type="checkbox"
                  checked={media.muted === false}
                  onChange={(event) => patchMedia({ muted: !event.target.checked })}
                />
                <span>{media.muted === false ? "开启原声" : "静音（默认）"}</span>
              </label>
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
};

const SceneEditor = ({
  selected,
  edit,
  assetList,
  onUpdateScene,
  onMoveScene,
  onToggleSceneLock,
}: {
  selected: Timeline;
  edit?: DraftEdit;
  assetList: string[];
  onUpdateScene: (sceneId: string, patch: SceneEdit) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onToggleSceneLock: (sceneId: string, field: SceneLockField) => void;
}) => {
  const sceneLocked = (sceneId: string, field: SceneLockField) =>
    Boolean(edit?.locks?.scenes?.[sceneId]?.[field]);

  return (
    <section className="drawerSection">
      <div className="miniHeader">
        <div>
          <p className="eyebrow">分镜编辑</p>
          <h2>场景结构与素材</h2>
        </div>
        <StatusBadge tone="neutral">{selected.scenes.length} 场景</StatusBadge>
      </div>
      <div className="sceneEditorList">
        {sceneTimings(selected).map(({ scene, label }, index) => (
          <article className="sceneEditorItem" key={scene.id}>
            <div className="sceneEditorHead">
              <span>{index + 1}</span>
              <div>
                <strong>{sceneLabel[scene.type]}</strong>
                <small>
                  {label} · {scene.assetType === "none" ? "占位背景" : scene.assetType}
                </small>
              </div>
              <div className="sceneMoveControls" aria-label="调整分镜顺序">
                <button
                  type="button"
                  className="miniIconButton"
                  disabled={index === 0}
                  onClick={() => onMoveScene(scene.id, -1)}
                  aria-label="上移分镜"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="miniIconButton"
                  disabled={index === selected.scenes.length - 1}
                  onClick={() => onMoveScene(scene.id, 1)}
                  aria-label="下移分镜"
                >
                  ↓
                </button>
              </div>
            </div>
            <div className="sceneGrid">
              <Field
                label="场景类型"
                action={
                  <LockButton
                    locked={sceneLocked(scene.id, "type")}
                    onToggle={() => onToggleSceneLock(scene.id, "type")}
                  />
                }
              >
                <select
                  value={scene.type}
                  onChange={(event) =>
                    onUpdateScene(scene.id, { type: event.target.value as SceneType })
                  }
                >
                  {sceneTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="时长"
                help="秒"
                action={
                  <LockButton
                    locked={sceneLocked(scene.id, "duration")}
                    onToggle={() => onToggleSceneLock(scene.id, "duration")}
                  />
                }
              >
                <input
                  min={1}
                  max={10}
                  type="number"
                  value={scene.duration}
                  onChange={(event) =>
                    onUpdateScene(scene.id, {
                      duration: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field
              label="画面大字"
              action={
                <LockButton
                  locked={sceneLocked(scene.id, "headline")}
                  onToggle={() => onToggleSceneLock(scene.id, "headline")}
                />
              }
            >
              <input
                data-testid={"scene-headline-" + scene.id}
                value={scene.headline}
                onChange={(event) => onUpdateScene(scene.id, { headline: event.target.value })}
              />
            </Field>
            <Field
              label="辅助文案"
              action={
                <LockButton
                  locked={sceneLocked(scene.id, "subtitle")}
                  onToggle={() => onToggleSceneLock(scene.id, "subtitle")}
                />
              }
            >
              <textarea
                data-testid={"scene-subtitle-" + scene.id}
                value={scene.subtitle ?? ""}
                onChange={(event) => onUpdateScene(scene.id, { subtitle: event.target.value })}
                rows={2}
              />
              {scene.subtitleSource ? (
                <small className="subtitleSourceTag">
                  字幕来源：{assetFileName(scene.subtitleSource.asset)}（
                  {scene.subtitleSource.segmentStart.toFixed(1)}–
                  {scene.subtitleSource.segmentEnd.toFixed(1)}s）
                </small>
              ) : null}
            </Field>
            <Field
              label="素材"
              action={
                <LockButton
                  locked={sceneLocked(scene.id, "asset")}
                  onToggle={() => onToggleSceneLock(scene.id, "asset")}
                />
              }
            >
              <select
                value={scene.asset ? normalizeAssetPath(scene.asset) : ""}
                onChange={(event) => {
                  const asset = event.target.value;
                  onUpdateScene(scene.id, {
                    asset: asset || undefined,
                    assetType: assetTypeFromPath(asset),
                  });
                }}
              >
                <option value="">占位素材 / 稍后补</option>
                {assetList.map((asset) => {
                  const path = normalizeAssetPath(asset);

                  return (
                    <option key={path} value={path}>
                      {assetFileName(path)}
                    </option>
                  );
                })}
              </select>
            </Field>
            <SceneMediaEditor scene={scene} onUpdateScene={onUpdateScene} />
          </article>
        ))}
      </div>
    </section>
  );
};

export const ExportGateNotice = ({
  timeline,
  analysis,
  edit,
  compact = false,
}: {
  timeline: Timeline;
  analysis: DraftAnalysis;
  edit?: DraftEdit;
  compact?: boolean;
}) => {
  const gate = exportGate(timeline, analysis, edit);
  if (gate.ok) {
    return (
      <div className="exportGate ok">
        <StatusBadge tone="success">可导出</StatusBadge>
        <span>已通过 schema、素材、内容和人工审核检查。</span>
      </div>
    );
  }

  return (
    <div className={"exportGate blocked" + (compact ? " compact" : "")}>
      <StatusBadge tone="danger">导出被阻止</StatusBadge>
      <ul>
        {gate.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
};

export const DraftInspector = ({
  selected,
  selectedIndex,
  selectedDraftId,
  analysis,
  isEdited,
  isReviewed,
  edit,
  assetList,
  history,
  onClose,
  onResetDraft,
  onRegenerateDraft,
  onToggleReview,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAutoFillMissingAssets,
  onSaveVersion,
  onRestoreVersion,
  onUpdatePublish,
  onUpdateHashtags,
  onUpdateScene,
  onMoveScene,
  onTogglePublishLock,
  onToggleSceneLock,
  onDownloadCurrent,
  onDownloadAll,
  onCopyCurrentJson,
  onIssueAction,
}: {
  selected: Timeline;
  selectedIndex: number;
  selectedDraftId: string;
  analysis: DraftAnalysis;
  isEdited: boolean;
  isReviewed: boolean;
  edit?: DraftEdit;
  assetList: string[];
  history: SavedVersion[];
  onClose: () => void;
  onResetDraft: () => void;
  onRegenerateDraft: () => void;
  onToggleReview: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAutoFillMissingAssets: () => void;
  onSaveVersion: () => void;
  onRestoreVersion: (version: SavedVersion) => void;
  onUpdatePublish: (field: "title" | "body" | "commentPrompt", value: string) => void;
  onUpdateHashtags: (value: string) => void;
  onUpdateScene: (sceneId: string, patch: SceneEdit) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onTogglePublishLock: (field: PublishLockField) => void;
  onToggleSceneLock: (sceneId: string, field: SceneLockField) => void;
  onDownloadCurrent: () => void;
  onDownloadAll: () => void;
  onCopyCurrentJson: () => void;
  onIssueAction: (check: CheckItem) => void;
}) => {
  const statusTone: StatusBadgeTone = analysis.exportReady
    ? "success"
    : analysis.blockingCount > 0
      ? "danger"
      : "warning";

  return (
    <div className="drawerBody" data-testid="draft-inspector">
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">
            当前草稿 #{String(selectedIndex + 1).padStart(2, "0")}
            <span className="draftIdTag" title={selectedDraftId}>
              {selectedDraftId.slice(0, 18)}
            </span>
          </p>
          <h2>{selected.template}</h2>
          <span>{selected.title}</span>
        </div>
        <div className="drawerHeaderActions">
          <button
            type="button"
            className="miniIconButton drawerCloseButton"
            onClick={onClose}
            aria-label="关闭检查器"
          >
            ×
          </button>
          <StatusBadge tone={statusTone}>
            {analysis.exportReady
              ? "可导出"
              : analysis.blockingCount > 0
                ? analysis.blockingCount + " 项需处理"
                : isReviewed
                  ? "已审核"
                  : "待审核"}
          </StatusBadge>
        </div>
      </div>

      <div className="drawerMeta">
        <article>
          <span>比例</span>
          <strong>{selected.format}</strong>
        </article>
        <article>
          <span>时长</span>
          <strong>{analysis.totalDuration}s</strong>
        </article>
        <article>
          <span>素材</span>
          <strong>
            {analysis.matchedAssets}/{selected.scenes.length}
          </strong>
        </article>
        <article>
          <span>检查</span>
          <strong>
            {analysis.blockingCount === 0 ? "通过" : analysis.blockingCount + " 项阻断"}
          </strong>
        </article>
      </div>

      <ExportGateNotice timeline={selected} analysis={analysis} edit={edit} compact />

      <div className="quickActions">
        <button
          type="button"
          className={isReviewed ? "primaryButton" : "secondaryButton"}
          onClick={onToggleReview}
        >
          {isReviewed ? "取消审核通过" : "标记审核通过"}
        </button>
        <button type="button" className="secondaryButton" onClick={onUndo} disabled={!canUndo}>
          撤销
        </button>
        <button type="button" className="secondaryButton" onClick={onRedo} disabled={!canRedo}>
          重做
        </button>
        <button type="button" className="secondaryButton" onClick={onRegenerateDraft}>
          重新生成当前草稿
        </button>
        <button type="button" className="secondaryButton" onClick={onAutoFillMissingAssets}>
          自动补齐素材
        </button>
        <button type="button" className="secondaryButton" onClick={onSaveVersion}>
          保存当前版本
        </button>
        {isEdited || hasLocks(edit?.locks) ? (
          <button className="linkButton" type="button" onClick={onResetDraft}>
            还原当前草稿
          </button>
        ) : null}
      </div>

      <p className="shortcutHint" aria-hidden="true">
        快捷键：⌘Z 撤销 · ⇧⌘Z 重做 · ⌘⏎ 标记审核 · ⌘S 保存版本 · Esc 关闭检查器
      </p>

      <div className="inspectorLayout">
        <div className="previewColumn">
          <StoryboardPreview timeline={selected} />
          <CheckListPanel analysis={analysis} onIssueAction={onIssueAction} />
        </div>
        <div className="editorColumn">
          <PublishEditor
            selected={selected}
            edit={edit}
            onUpdatePublish={onUpdatePublish}
            onUpdateHashtags={onUpdateHashtags}
            onTogglePublishLock={onTogglePublishLock}
          />
          <SceneEditor
            selected={selected}
            edit={edit}
            assetList={assetList}
            onUpdateScene={onUpdateScene}
            onMoveScene={onMoveScene}
            onToggleSceneLock={onToggleSceneLock}
          />
          <section className="drawerSection compactActions">
            <button type="button" className="secondaryButton" onClick={onCopyCurrentJson}>
              复制当前 JSON
            </button>
            <button type="button" className="secondaryButton" onClick={onDownloadCurrent}>
              下载当前 JSON
            </button>
            <button type="button" className="secondaryButton" onClick={onDownloadAll}>
              下载全部草稿
            </button>
          </section>
          <section className="drawerSection historyPanel">
            <div className="miniHeader">
              <div>
                <p className="eyebrow">版本</p>
                <h2>草稿历史</h2>
              </div>
              <StatusBadge tone="neutral">{history.length} 个版本</StatusBadge>
            </div>
            {history.length === 0 ? (
              <EmptyMini>保存当前版本后，可以随时恢复这个草稿。</EmptyMini>
            ) : (
              <div className="historyList">
                {history.map((version) => (
                  <button
                    className="historyItem"
                    key={version.id}
                    type="button"
                    onClick={() => onRestoreVersion(version)}
                  >
                    <strong>{version.label}</strong>
                    <span>{new Date(version.savedAt).toLocaleString("zh-CN")}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export type { DraftLocks };
