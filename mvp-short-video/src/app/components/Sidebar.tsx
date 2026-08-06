import { navGroups } from "../types.ts";
import type { WorkspaceView } from "../types.ts";
import { StatusBadge } from "./ui.tsx";

export type ThemeMode = "auto" | "light" | "dark";

export const Sidebar = ({
  activeView,
  draftCount,
  blockingCount,
  aiScore,
  merchantName,
  location,
  industry,
  visibleCount,
  totalCount,
  themeMode,
  onNavigate,
  onClearWorkspace,
  onToggleTheme,
}: {
  activeView: WorkspaceView;
  draftCount: number;
  blockingCount: number;
  aiScore: number;
  merchantName: string;
  location: string;
  industry: string;
  visibleCount: number;
  totalCount: number;
  themeMode: ThemeMode;
  onNavigate: (view: WorkspaceView) => void;
  onClearWorkspace: () => void;
  onToggleTheme: () => void;
}) => (
  <aside className="sidebar" aria-label="产品导航">
    <div className="brand">
      <span className="brandMark">AI</span>
      <div>
        <strong>Clips Studio</strong>
        <small>本地商家草稿</small>
      </div>
    </div>

    <button className="contextSwitcher" type="button" aria-label="当前项目">
      <span className="contextIcon">9:16</span>
      <span>
        <small>项目</small>
        <strong>{merchantName}</strong>
      </span>
    </button>

    <nav className="sideNav" aria-label="主要导航">
      {navGroups.map((group) => (
        <div className="navGroup" key={group.label}>
          <p className="navSection">{group.label}</p>
          {group.items.map((item) => (
            <button
              aria-current={activeView === item.view ? "page" : undefined}
              className={activeView === item.view ? "active" : ""}
              key={item.view}
              onClick={() => onNavigate(item.view)}
              type="button"
            >
              <span className="navIcon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="navLabel">{item.label}</span>
              {item.view === "drafts" ? (
                <StatusBadge tone="success">{draftCount}</StatusBadge>
              ) : null}
              {item.view === "checks" && blockingCount > 0 ? (
                <StatusBadge tone="danger">{blockingCount}</StatusBadge>
              ) : null}
              {item.view === "aiEdit" ? (
                <StatusBadge tone={aiScore >= 82 ? "success" : "warning"}>{aiScore}</StatusBadge>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </nav>

    <div className="sidebarPanel">
      <small>当前工作区</small>
      <strong>{location}</strong>
      <span>
        {industry} · {visibleCount}/{totalCount} 条可见草稿
      </span>
    </div>

    <div className="sidebarFooter">
      <StatusBadge tone="info">本地优先</StatusBadge>
      <span>配置、草稿修改、历史版本会自动保存在本机浏览器。</span>
      <div className="sidebarThemeRow">
        <button
          type="button"
          className="linkButton subtleAction"
          onClick={onToggleTheme}
          aria-label="切换外观模式"
        >
          外观：{themeMode === "auto" ? "自动" : themeMode === "light" ? "浅色" : "深色"}
        </button>
        <button
          className="linkButton subtleAction"
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "清除本地记录会删除本机保存的工作区、草稿编辑和历史版本（当前页面状态保留）。确定继续？",
              )
            ) {
              onClearWorkspace();
            }
          }}
        >
          清除本地记录
        </button>
      </div>
    </div>
  </aside>
);
