import { useEffect, useRef } from "react";
import { templateInfo, toneInfo } from "../timeline.ts";
import { numberValue } from "../state/workspace.ts";
import type {
  DraftAnalysis,
  GenerationRules,
  LLMConfig,
  ProjectMeta,
  TemplateId,
  Timeline,
  ToneId,
} from "../types.ts";
import { Field, StatusBadge } from "./ui.tsx";
import { ScenePreview, TimelineStrip } from "./Storyboard.tsx";

export type MerchantField =
  | "name"
  | "industry"
  | "location"
  | "region"
  | "audience"
  | "keyword"
  | "hook"
  | "sellingPoints"
  | "painPoints"
  | "proofPoints"
  | "offer"
  | "cta"
  | "hashtags"
  | "brandStyle";

export const MerchantSettingsPanel = ({
  fields,
  assetsText,
  setAssetsText,
  onChange,
  onNewProject,
  onImportConfig,
  onExportConfig,
  projects,
  currentProjectId,
  onRefreshProjects,
  onSaveProject,
  onLoadProject,
  onDeleteProject,
}: {
  fields: Record<MerchantField, string>;
  assetsText: string;
  setAssetsText: (value: string) => void;
  onChange: (field: MerchantField, value: string) => void;
  onNewProject: () => void;
  onImportConfig: (text: string) => void;
  onExportConfig: () => void;
  projects: ProjectMeta[];
  currentProjectId: string;
  onRefreshProjects: () => void;
  onSaveProject: () => void;
  onLoadProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}) => {
  const refreshRef = useRef(false);
  useEffect(() => {
    if (!refreshRef.current) {
      refreshRef.current = true;
      onRefreshProjects();
    }
  }, [onRefreshProjects]);

  const readConfigFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImportConfig(reader.result);
      }
    };
    reader.readAsText(file);
  };

  return (
    <section className="panel settingsPanel viewPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">配置</p>
          <h2>商家设置</h2>
          <p>把商家资料、卖点痛点、CTA、话题标签和授权素材路径拆开维护。</p>
        </div>
        <div className="buttonGroup">
          <button
            type="button"
            className="secondaryButton"
            onClick={() => {
              if (
                window.confirm("创建新商家项目会清空当前工作区（草稿、编辑和批次）。确定继续？")
              ) {
                onNewProject();
              }
            }}
          >
            新建项目
          </button>
          <label className="secondaryButton importFileButton" role="button" tabIndex={0}>
            导入配置
            <input
              type="file"
              accept="application/json,.json"
              aria-label="导入商家配置 JSON"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  readConfigFile(file);
                }
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="secondaryButton" onClick={onExportConfig}>
            导出配置
          </button>
        </div>
      </div>

      <div className="settingsGrid">
        <div className="settingsGroup">
          <div className="groupHeader">
            <strong>商家资料</strong>
            <span>决定视频的行业、地区和目标人群。</span>
          </div>
          <Field label="商家名称">
            <input value={fields.name} onChange={(event) => onChange("name", event.target.value)} />
          </Field>
          <div className="twoColumns">
            <Field label="行业">
              <input
                value={fields.industry}
                onChange={(event) => onChange("industry", event.target.value)}
              />
            </Field>
            <Field label="城市/区域">
              <input
                value={fields.location}
                onChange={(event) => onChange("location", event.target.value)}
              />
            </Field>
          </div>
          <div className="twoColumns">
            <Field label="目标人群">
              <input
                value={fields.audience}
                onChange={(event) => onChange("audience", event.target.value)}
              />
            </Field>
            <Field label="细分区域" help="如：大理古城">
              <input
                value={fields.region}
                onChange={(event) => onChange("region", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="settingsGroup">
          <div className="groupHeader">
            <strong>卖点痛点</strong>
            <span>控制钩子、痛点、证据和卖点生成方向。</span>
          </div>
          <div className="twoColumns">
            <Field label="评论关键词">
              <input
                value={fields.keyword}
                onChange={(event) => onChange("keyword", event.target.value)}
              />
            </Field>
            <Field label="首条钩子">
              <input
                value={fields.hook}
                onChange={(event) => onChange("hook", event.target.value)}
              />
            </Field>
          </div>
          <Field label="卖点" help="每行一个">
            <textarea
              value={fields.sellingPoints}
              onChange={(event) => onChange("sellingPoints", event.target.value)}
              rows={4}
            />
          </Field>
          <Field label="痛点" help="每行一个">
            <textarea
              value={fields.painPoints}
              onChange={(event) => onChange("painPoints", event.target.value)}
              rows={3}
            />
          </Field>
          <Field label="证据点" help="每行一个">
            <textarea
              value={fields.proofPoints}
              onChange={(event) => onChange("proofPoints", event.target.value)}
              rows={3}
            />
          </Field>
        </div>

        <div className="settingsGroup">
          <div className="groupHeader">
            <strong>CTA</strong>
            <span>定义转化利益点和评论引导。</span>
          </div>
          <Field label="转化利益点">
            <input
              value={fields.offer}
              onChange={(event) => onChange("offer", event.target.value)}
            />
          </Field>
          <Field label="CTA">
            <input value={fields.cta} onChange={(event) => onChange("cta", event.target.value)} />
          </Field>
        </div>

        <div className="settingsGroup">
          <div className="groupHeader">
            <strong>话题标签</strong>
            <span>用于发布文案和导出 JSON。</span>
          </div>
          <Field label="话题标签">
            <textarea
              value={fields.hashtags}
              onChange={(event) => onChange("hashtags", event.target.value)}
              rows={4}
            />
          </Field>
          <Field label="品牌风格" help="如：克制、真实、慢节奏">
            <input
              value={fields.brandStyle}
              onChange={(event) => onChange("brandStyle", event.target.value)}
            />
          </Field>
        </div>

        <div className="settingsGroup wide">
          <div className="groupHeader">
            <strong>素材路径</strong>
            <span>真实素材放在 public/assets/；每行一个相对 public/ 的路径。</span>
          </div>
          <Field label="素材路径">
            <textarea
              value={assetsText}
              onChange={(event) => setAssetsText(event.target.value)}
              rows={6}
            />
          </Field>
        </div>

        <div className="settingsGroup wide">
          <div className="groupHeader">
            <strong>项目快照</strong>
            <span>
              保存当前商家配置与生成规则，随时在多个商家项目之间切换；桌面端存入本地
              SQLite，浏览器存入 localStorage。
            </span>
          </div>
          <div className="projectBar">
            <button type="button" className="secondaryButton" onClick={onSaveProject}>
              保存当前项目
            </button>
            <span className="currentProjectTag">
              当前项目：{fields.name || "未命名商家"} · {currentProjectId.slice(0, 8)}
            </span>
          </div>
          <div className="projectList">
            {projects.length === 0 ? (
              <div className="emptyMini">
                还没有保存的项目。填写好商家资料后点击“保存当前项目”。
              </div>
            ) : (
              projects.map((project) => (
                <article className="projectItem" key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {new Date(project.savedAt).toLocaleString("zh-CN")} · {project.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="cardActions">
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={project.id === currentProjectId}
                      onClick={() => onLoadProject(project.id)}
                    >
                      {project.id === currentProjectId ? "当前项目" : "切换"}
                    </button>
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() => {
                        if (
                          window.confirm("删除项目快照“" + project.name + "”？当前工作区不受影响。")
                        ) {
                          onDeleteProject(project.id);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export const RulesPanel = ({
  selected,
  selectedAnalysis,
  rules,
  llmConfig,
  onSetLLMConfig,
  onToggleTemplate,
  onChange,
  onRegenerate,
}: {
  selected: Timeline;
  selectedAnalysis: DraftAnalysis;
  rules: GenerationRules;
  llmConfig: LLMConfig;
  onSetLLMConfig: (config: LLMConfig) => void;
  onToggleTemplate: (templateId: TemplateId) => void;
  onChange: (field: keyof GenerationRules, value: number | TemplateId[] | ToneId) => void;
  onRegenerate: () => void;
}) => (
  <section className="panel viewPanel">
    <div className="sectionHeader">
      <div>
        <p className="eyebrow">规则</p>
        <h2>生成规则</h2>
        <p>控制生成数量、模板类型、语气和视频时长区间；变更后会即时影响草稿。</p>
      </div>
      <div className="buttonGroup">
        <StatusBadge tone="info">{rules.count} 条</StatusBadge>
        <button type="button" className="secondaryButton" onClick={onRegenerate}>
          按规则重新生成
        </button>
      </div>
    </div>
    <div className="rulesLayout">
      <div className="settingsGroup">
        <div className="groupHeader">
          <strong>批量生成</strong>
          <span>第一版目标是 10 分钟生成 10 条可审核草稿。</span>
        </div>
        <Field label="生成数量" help="1-20 条">
          <input
            min={1}
            max={20}
            type="number"
            value={rules.count}
            onChange={(event) =>
              onChange("count", numberValue(Number(event.target.value), 10, 1, 20))
            }
          />
        </Field>
        <div className="twoColumns">
          <Field label="最短时长">
            <input
              min={10}
              max={60}
              type="number"
              value={rules.minDuration}
              onChange={(event) =>
                onChange("minDuration", numberValue(Number(event.target.value), 18, 10, 60))
              }
            />
          </Field>
          <Field label="最长时长">
            <input
              min={10}
              max={60}
              type="number"
              value={rules.maxDuration}
              onChange={(event) =>
                onChange("maxDuration", numberValue(Number(event.target.value), 24, 10, 60))
              }
            />
          </Field>
        </div>
        <Field label="语气">
          <select
            value={rules.tone}
            onChange={(event) => onChange("tone", event.target.value as ToneId)}
          >
            {toneInfo.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="settingsGroup">
        <div className="groupHeader">
          <strong>模板类型</strong>
          <span>至少保留一个模板，草稿会在选中模板间轮换。</span>
        </div>
        <div className="templateChoiceGrid">
          {templateInfo.map((template) => (
            <button
              className={rules.templateIds.includes(template.id) ? "active" : ""}
              key={template.id}
              type="button"
              onClick={() => onToggleTemplate(template.id)}
            >
              <strong>{template.label}</strong>
              <span>{template.id}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settingsGroup">
        <div className="groupHeader">
          <strong>模型生成（可选）</strong>
          <span>OpenAI 兼容接口；只接收结构化 DraftProposal，离线时退回本地规则生成器。</span>
        </div>
        <Field label="Provider">
          <select
            value={llmConfig.provider}
            onChange={(event) =>
              onSetLLMConfig({
                ...llmConfig,
                provider: event.target.value as LLMConfig["provider"],
              })
            }
          >
            <option value="local">本地规则（默认，离线可用）</option>
            <option value="openai-compatible">OpenAI 兼容接口</option>
          </select>
        </Field>
        <div className="twoColumns">
          <Field label="Base URL" help="如 https://api.openai.com/v1">
            <input
              value={llmConfig.baseUrl}
              onChange={(event) => onSetLLMConfig({ ...llmConfig, baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="模型" help="如 gpt-4o-mini">
            <input
              value={llmConfig.model}
              onChange={(event) => onSetLLMConfig({ ...llmConfig, model: event.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>
        </div>
        <Field label="API Key" help="仅保存在本机浏览器，不会写入导出包">
          <input
            type="password"
            value={llmConfig.apiKey}
            onChange={(event) => onSetLLMConfig({ ...llmConfig, apiKey: event.target.value })}
            placeholder="sk-…"
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="rulesPreview">
        <div className="miniHeader">
          <div>
            <p className="eyebrow">结构预览</p>
            <h2>当前 5 步时间线</h2>
          </div>
          <StatusBadge tone="neutral">{selectedAnalysis.totalDuration}s</StatusBadge>
        </div>
        <TimelineStrip timeline={selected} />
        <ScenePreview timeline={selected} />
      </div>
    </div>
  </section>
);

export const BatchCheckPanel = ({
  drafts,
  draftAnalyses,
  selectedIndex,
  onSelectDraft,
  onApproveAllReady,
  onCompare,
}: {
  drafts: Timeline[];
  draftAnalyses: DraftAnalysis[];
  selectedIndex: number;
  onSelectDraft: (index: number) => void;
  onApproveAllReady: () => void;
  onCompare: (index: number) => void;
}) => (
  <div className="miniHeader">
    <div>
      <p className="eyebrow">批量状态</p>
      <h2>全部草稿概览</h2>
    </div>
    <div className="buttonGroup">
      <StatusBadge tone="info">
        {draftAnalyses.filter((analysis) => analysis.exportReady).length}/{drafts.length} 可导出
      </StatusBadge>
      <button
        type="button"
        className="secondaryButton"
        onClick={() => {
          if (
            window.confirm(
              "将把没有阻断项的草稿批量标记为“已审核通过”（并记录内容哈希）。确定继续？",
            )
          ) {
            onApproveAllReady();
          }
        }}
      >
        批量审核通过
      </button>
    </div>
    <div className="batchCheckList">
      {drafts.map((draft, index) => {
        const analysis = draftAnalyses[index];

        return (
          <button
            className={"batchCheckItem" + (index === selectedIndex ? " selected" : "")}
            key={draft.draftId ?? draft.template + index}
            type="button"
            onClick={() => onSelectDraft(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{draft.publishCopy.title}</strong>
            <StatusBadge
              tone={
                analysis.exportReady ? "success" : analysis.blockingCount > 0 ? "danger" : "warning"
              }
            >
              {analysis.exportReady
                ? "可导出"
                : analysis.blockingCount > 0
                  ? analysis.blockingCount + " 项"
                  : "待审核"}
            </StatusBadge>
            <button
              type="button"
              className="linkButton batchCompareButton"
              onClick={(event) => {
                event.stopPropagation();
                onCompare(index);
              }}
            >
              对比
            </button>
          </button>
        );
      })}
    </div>
  </div>
);
