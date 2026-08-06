import { templateLabel } from "../types.ts";
import type { DraftAnalysis, DraftEdit, DraftStatusFilter, SortMode, Timeline } from "../types.ts";
import { draftHasContentEdits } from "../analysis.ts";
import { StatusBadge } from "./ui.tsx";

export type VisibleDraft = {
  draft: Timeline;
  index: number;
  analysis: DraftAnalysis;
};

export const DraftListPanel = ({
  drafts,
  selectedIndex,
  selectedAnalysis,
  visibleDrafts,
  draftStats,
  lastGenerated,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  sortMode,
  setSortMode,
  templateFilter,
  setTemplateFilter,
  templateOptions,
  draftEdits,
  onSelectDraft,
  onOpenInspector,
  onDownloadCurrent,
  onDownloadAll,
}: {
  drafts: Timeline[];
  selectedIndex: number;
  selectedAnalysis: DraftAnalysis;
  visibleDrafts: VisibleDraft[];
  draftStats: { edited: number; missing: number; ready: number; approved: number; review: number };
  lastGenerated: string;
  query: string;
  setQuery: (value: string) => void;
  statusFilter: DraftStatusFilter;
  setStatusFilter: (value: DraftStatusFilter) => void;
  sortMode: SortMode;
  setSortMode: (value: SortMode) => void;
  templateFilter: string;
  setTemplateFilter: (value: string) => void;
  templateOptions: string[];
  draftEdits: Record<string, DraftEdit>;
  onSelectDraft: (index: number) => void;
  onOpenInspector: () => void;
  onDownloadCurrent: () => void;
  onDownloadAll: () => void;
}) => {
  const selected = drafts[selectedIndex];

  return (
    <section className="panel draftPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">草稿列表</p>
          <h2>全部草稿</h2>
          <p>
            {visibleDrafts.length}/{drafts.length} 条候选 · 可筛选状态、排序、进入当前检查编辑。
          </p>
        </div>
        <div className="summaryPills" aria-label="当前草稿概览">
          <span>
            {selectedAnalysis.matchedAssets}/{selected?.scenes.length ?? 0} 素材
          </span>
          <span>{selectedAnalysis.totalDuration}s</span>
          <span>{selected ? (templateLabel[selected.template] ?? selected.template) : "-"}</span>
          <span>{lastGenerated}</span>
        </div>
        <div className="buttonGroup">
          <button type="button" className="secondaryButton" onClick={onOpenInspector}>
            检查当前
          </button>
          <button type="button" className="secondaryButton" onClick={onDownloadCurrent}>
            下载当前
          </button>
          <button type="button" className="secondaryButton" onClick={onDownloadAll}>
            下载全部
          </button>
        </div>
      </div>

      <div className="draftStatsBar" aria-label="草稿状态汇总">
        <article>
          <span>已编辑</span>
          <strong>{draftStats.edited}</strong>
        </article>
        <article>
          <span>已审核</span>
          <strong>{draftStats.approved}</strong>
        </article>
        <article>
          <span>缺素材</span>
          <strong>{draftStats.missing}</strong>
        </article>
        <article>
          <span>可导出</span>
          <strong>{draftStats.ready}</strong>
        </article>
        <article>
          <span>待审核</span>
          <strong>{draftStats.review}</strong>
        </article>
      </div>

      <div className="filterToolbar" aria-label="草稿筛选">
        <div className="searchField">
          <span>/</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、正文、模板、CTA 或标签"
            aria-label="搜索草稿"
          />
        </div>
        <div className="toolbarSelects">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as DraftStatusFilter)}
            aria-label="状态过滤"
          >
            <option value="all">全部状态</option>
            <option value="edited">已编辑</option>
            <option value="missing">缺素材 / 待补</option>
            <option value="ready">可导出</option>
            <option value="review">待审核</option>
          </select>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            aria-label="草稿排序"
          >
            <option value="default">默认排序</option>
            <option value="ready">可导出优先</option>
            <option value="duration-asc">时长短到长</option>
            <option value="duration-desc">时长长到短</option>
            <option value="title">标题排序</option>
          </select>
        </div>
        <div className="templateFilters" aria-label="模板过滤">
          <button
            className={templateFilter === "all" ? "active" : ""}
            type="button"
            onClick={() => setTemplateFilter("all")}
          >
            全部
          </button>
          {templateOptions.map((template) => (
            <button
              className={templateFilter === template ? "active" : ""}
              key={template}
              type="button"
              onClick={() => setTemplateFilter(template)}
            >
              {templateLabel[template] ?? template}
            </button>
          ))}
        </div>
      </div>

      {visibleDrafts.length === 0 ? (
        <div className="emptyState">
          <strong>没有匹配的草稿</strong>
          <span>清空搜索或切换模板、状态过滤，再继续查看候选方向。</span>
          <button
            className="secondaryButton"
            type="button"
            onClick={() => {
              setQuery("");
              setTemplateFilter("all");
              setStatusFilter("all");
            }}
          >
            清空筛选
          </button>
        </div>
      ) : (
        <div className="draftList" role="listbox" aria-label="草稿列表">
          {visibleDrafts.map(({ draft, index, analysis }) => {
            const isSelected = index === selectedIndex;
            const isEdited = draftHasContentEdits(draftEdits[draft.draftId ?? ""]);

            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={draft.draftId ?? draft.template + index}
                className={"draftRow " + (isSelected ? "selected" : "")}
                onClick={() => {
                  onSelectDraft(index);
                  onOpenInspector();
                }}
              >
                <span className="draftIndex">{String(index + 1).padStart(2, "0")}</span>
                <span className="draftRowMain">
                  <strong>{draft.publishCopy.title}</strong>
                  <small>{draft.publishCopy.body.split("\n")[0]}</small>
                  <span className="draftPrompt">{draft.publishCopy.commentPrompt}</span>
                </span>
                <span className="draftRowMeta">
                  <span>{templateLabel[draft.template] ?? draft.template}</span>
                  <span>{analysis.totalDuration}s</span>
                  {isEdited ? <span className="editedTag">已编辑</span> : null}
                  <StatusBadge tone={analysis.reviewComplete ? "success" : "warning"}>
                    {analysis.reviewComplete ? "已审核" : "待审核"}
                  </StatusBadge>
                  <StatusBadge tone={analysis.missingAssets === 0 ? "neutral" : "danger"}>
                    {analysis.missingAssets === 0 ? "素材齐" : "缺素材"}
                  </StatusBadge>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
