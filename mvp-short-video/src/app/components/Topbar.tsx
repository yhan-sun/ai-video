import type { StorageNotice, WorkspaceView } from "../types.ts";
import { StatusBadge } from "./ui.tsx";

export const Topbar = ({
  title,
  location,
  merchantName,
  query,
  setQuery,
  onRegenerate,
  onToggleInspector,
  onExportConfig,
}: {
  title: string;
  location: string;
  merchantName: string;
  query: string;
  setQuery: (value: string) => void;
  onRegenerate: () => void;
  onToggleInspector: () => void;
  onExportConfig: () => void;
}) => (
  <header className="topbar">
    <div className="topbarTitle">
      <p className="breadcrumb">
        内容工作台 / {title} / {location}
      </p>
      <h1>{title}</h1>
      <span>{merchantName} · 本地商家 AI 短视频草稿工作台</span>
    </div>
    <div className="topbarControls">
      <button
        type="button"
        className="secondaryButton inspectorToggleButton"
        onClick={onToggleInspector}
      >
        检查器
      </button>
      <div className="globalSearch" role="search">
        <span>/</span>
        <input
          id="global-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索草稿、模板、CTA"
          aria-label="全局搜索草稿"
        />
      </div>
      <button className="secondaryButton" type="button" onClick={onExportConfig}>
        导出配置
      </button>
      <button className="primaryButton" type="button" onClick={onRegenerate}>
        重新生成
      </button>
    </div>
  </header>
);

export const StatusStrip = ({
  selectedIndex,
  matchedAssets,
  totalScenes,
  blockingCount,
  reviewed,
  readyCount,
  totalCount,
  onShowInspector,
  onShowAssets,
  onShowChecks,
  onToggleReview,
  onShowExport,
}: {
  selectedIndex: number;
  matchedAssets: number;
  totalScenes: number;
  blockingCount: number;
  reviewed: boolean;
  readyCount: number;
  totalCount: number;
  onShowInspector: () => void;
  onShowAssets: () => void;
  onShowChecks: () => void;
  onToggleReview: () => void;
  onShowExport: () => void;
}) => (
  <div className="workspaceStatusStrip" aria-label="工作区状态">
    <button type="button" onClick={onShowInspector}>
      <span>当前草稿</span>
      <strong>#{String(selectedIndex + 1).padStart(2, "0")}</strong>
    </button>
    <button type="button" onClick={onShowAssets}>
      <span>素材命中</span>
      <strong>
        {matchedAssets}/{totalScenes}
      </strong>
    </button>
    <button type="button" onClick={onShowChecks}>
      <span>阻断项</span>
      <strong>{blockingCount}</strong>
    </button>
    <button type="button" onClick={onToggleReview}>
      <span>人工审核</span>
      <strong>{reviewed ? "已通过" : "待确认"}</strong>
    </button>
    <button type="button" onClick={onShowExport}>
      <span>可导出</span>
      <strong>
        {readyCount}/{totalCount}
      </strong>
    </button>
  </div>
);

export const MigrationNotice = ({
  notice,
  onDismiss,
}: {
  notice: StorageNotice | null;
  onDismiss: () => void;
}) => {
  if (!notice) {
    return null;
  }

  return (
    <div className={"migrationNotice " + notice.kind} role="status">
      <StatusBadge
        tone={notice.kind === "failed" ? "danger" : notice.kind === "migrated" ? "info" : "neutral"}
      >
        {notice.kind === "failed" ? "迁移失败" : notice.kind === "migrated" ? "已迁移" : "提示"}
      </StatusBadge>
      <span>{notice.message}</span>
      <button type="button" className="linkButton" onClick={onDismiss}>
        知道了
      </button>
    </div>
  );
};

export type { WorkspaceView };
