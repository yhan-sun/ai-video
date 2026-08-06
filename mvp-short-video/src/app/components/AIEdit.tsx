import { aiEditModes } from "../ai.ts";
import { durationOf } from "../format.ts";
import { sceneLabel } from "../types.ts";
import type { AIEditDiff, AIEditMode, AIEditPlan, DraftAnalysis, Timeline } from "../types.ts";
import { StatusBadge } from "./ui.tsx";
import { StoryboardPreview } from "./Storyboard.tsx";

export const AIEditPanel = ({
  selected,
  selectedIndex,
  analysis,
  mode,
  plan,
  previewTimeline,
  diff,
  onSetMode,
  onApplyCurrent,
  onFixExport,
  onApplyAll,
  onApplyItem,
  onLLMGenerateAll,
  onLLMOptimizeCurrent,
  onCancelLlm,
  llmConfigured,
  llmBusy,
  onGoPreview,
}: {
  selected: Timeline;
  selectedIndex: number;
  analysis: DraftAnalysis;
  mode: AIEditMode;
  plan: AIEditPlan;
  previewTimeline: Timeline;
  diff: AIEditDiff;
  onSetMode: (mode: AIEditMode) => void;
  onApplyCurrent: () => void;
  onFixExport: () => void;
  onApplyAll: () => void;
  onApplyItem: (label: string) => void;
  onLLMGenerateAll: () => void;
  onLLMOptimizeCurrent: () => void;
  onCancelLlm: () => void;
  llmConfigured: boolean;
  llmBusy: boolean;
  onGoPreview: () => void;
}) => (
  <section className="panel viewPanel aiEditPanel">
    <div className="sectionHeader">
      <div>
        <p className="eyebrow">AI 剪辑</p>
        <h2>本地智能剪辑助理</h2>
        <p>基于当前草稿和授权素材做节奏、分镜、文案和素材的本地优化，不接外部视频抓取。</p>
      </div>
      <StatusBadge tone={plan.score >= 82 ? "success" : plan.score >= 68 ? "warning" : "danger"}>
        剪辑分 {plan.score}
      </StatusBadge>
    </div>

    <div className="aiEditLayout">
      <aside className="aiModePanel">
        <div className="groupHeader">
          <strong>剪辑模式</strong>
          <span>选择 AI 助手这次优化的优先目标。</span>
        </div>
        <div className="aiModeGrid">
          {aiEditModes.map((option) => (
            <button
              className={mode === option.id ? "active" : ""}
              key={option.id}
              type="button"
              onClick={() => onSetMode(option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.detail}</span>
            </button>
          ))}
        </div>
        <div className="aiActionStack">
          <button type="button" className="primaryButton" onClick={onApplyCurrent}>
            应用到当前草稿
          </button>
          <button type="button" className="secondaryButton" onClick={onFixExport}>
            修复导出阻断
          </button>
          <button type="button" className="secondaryButton" onClick={onApplyAll}>
            批量优化全部草稿
          </button>
          <button type="button" className="linkButton" onClick={onGoPreview}>
            去当前检查微调
          </button>
        </div>
      </aside>

      <div className="aiPlanPanel">
        <div className="aiScoreBoard">
          <article>
            <span>当前草稿</span>
            <strong>#{String(selectedIndex + 1).padStart(2, "0")}</strong>
          </article>
          <article>
            <span>AI 模式</span>
            <strong>{plan.modeLabel}</strong>
          </article>
          <article>
            <span>预测时长</span>
            <strong>{plan.predictedDuration}s</strong>
          </article>
          <article>
            <span>目标时长</span>
            <strong>{plan.targetDuration}s</strong>
          </article>
          <article>
            <span>素材命中</span>
            <strong>
              {analysis.matchedAssets}/{selected.scenes.length}
            </strong>
          </article>
          <article>
            <span>锁定保护</span>
            <strong>{plan.lockedFields}</strong>
          </article>
        </div>

        <section className="aiPlanSummary">
          <div className="miniHeader">
            <div>
              <p className="eyebrow">剪辑方案</p>
              <h2>{selected.publishCopy.title}</h2>
            </div>
            <StatusBadge tone="info">
              {durationOf(selected)}s → {plan.predictedDuration}s
            </StatusBadge>
          </div>
          <p>{plan.summary}</p>
          <div className="aiOrderPreview">
            {plan.sceneOrder.map((sceneId, index) => {
              const scene = selected.scenes.find((item) => item.id === sceneId);
              return scene ? (
                <span key={sceneId}>
                  {index + 1}. {sceneLabel[scene.type]}
                </span>
              ) : null;
            })}
          </div>
        </section>

        <section className="aiDiffPanel">
          <article>
            <span>时长变化</span>
            <strong>
              {diff.durationBefore}s → {diff.durationAfter}s
            </strong>
            <small>
              {diff.durationDelta === 0
                ? "不变"
                : diff.durationDelta > 0
                  ? "+" + diff.durationDelta + "s"
                  : diff.durationDelta + "s"}
            </small>
          </article>
          <article>
            <span>分镜顺序</span>
            <strong>{diff.reorderedScenes ? "会重排" : "不重排"}</strong>
            <small>{diff.reorderedScenes ? "按模式优先级调整" : "保持当前结构"}</small>
          </article>
          <article>
            <span>文案/时长</span>
            <strong>{diff.textChanges} 处</strong>
            <small>含标题、正文、分镜文案和秒数</small>
          </article>
          <article>
            <span>素材替换</span>
            <strong>{diff.assetChanges} 处</strong>
            <small>{diff.assetChanges > 0 ? "按标签和场景补齐" : "沿用当前素材"}</small>
          </article>
          <article>
            <span>已锁定</span>
            <strong>{diff.lockedFields} 项</strong>
            <small>AI 不会覆盖锁定字段</small>
          </article>
        </section>

        <section className="aiSuggestionPanel">
          <div className="miniHeader">
            <div>
              <p className="eyebrow">AI 建议</p>
              <h2>导出前优化点</h2>
            </div>
            <StatusBadge tone={analysis.exportReady ? "success" : "warning"}>
              {analysis.exportReady ? "可导出" : "可优化"}
            </StatusBadge>
          </div>
          <div className="aiSuggestionGrid">
            {plan.suggestions.map((suggestion) => (
              <article key={suggestion.label}>
                <div className="aiSuggestionHead">
                  <StatusBadge tone={suggestion.severity}>
                    {suggestion.severity === "success"
                      ? "通过"
                      : suggestion.severity === "danger"
                        ? "优先"
                        : "建议"}
                  </StatusBadge>
                  <button
                    type="button"
                    className="linkButton"
                    disabled={suggestion.severity === "success" || suggestion.label === "锁定保护"}
                    onClick={() => onApplyItem(suggestion.label)}
                  >
                    应用此项
                  </button>
                </div>
                <strong>{suggestion.label}</strong>
                <span>{suggestion.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="llmPanel">
          <div className="miniHeader">
            <div>
              <p className="eyebrow">模型生成</p>
              <h2>LLM Provider（可替换）</h2>
            </div>
            <StatusBadge tone={llmConfigured ? "success" : "neutral"}>
              {llmConfigured ? "已配置" : "本地规则"}
            </StatusBadge>
          </div>
          <p>
            模型只输出经过共享 Zod schema 校验的 DraftProposal
            结构化草稿；不生成剪辑代码，不得虚构价格、优惠、销量、评价、距离或效果；证据不足会自动标记
            needsHumanEvidence 并阻断导出。
          </p>
          {llmBusy ? (
            <div className="buttonGroup">
              <StatusBadge tone="info">生成中…</StatusBadge>
              <button type="button" className="secondaryButton" onClick={onCancelLlm}>
                取消生成
              </button>
            </div>
          ) : (
            <div className="buttonGroup">
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void onLLMOptimizeCurrent()}
                disabled={!llmConfigured}
              >
                用模型优化当前草稿
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void onLLMGenerateAll()}
              >
                生成全部草稿（模型或本地规则）
              </button>
            </div>
          )}
        </section>

        <StoryboardPreview
          timeline={previewTimeline}
          eyebrow="9:16 AI Preview"
          title="应用后草稿预览"
        />
      </div>
    </div>
  </section>
);
