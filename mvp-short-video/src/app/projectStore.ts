// 项目历史存储：桌面端走 SQLite（Rust 命令），浏览器端走 localStorage。
// 快照内容只含「配置 + 规则 + 素材清单与标签/授权」，不含缩略图、编辑与历史，切换成本低。
import type { AssetAuthorization, AssetTag, GenerationRules, MerchantConfig } from "./types.ts";
import type { ProjectData, ProjectMeta } from "./desktop.ts";

export const PROJECTS_STORAGE_KEY = "clips-studio-projects-v1";

export const buildProjectSnapshot = ({
  id,
  name,
  config,
  rules,
  assetsText,
  tags,
  authorization,
}: {
  id: string;
  name: string;
  config: MerchantConfig;
  rules: GenerationRules;
  assetsText: string;
  tags: Record<string, AssetTag[]>;
  authorization: Record<string, AssetAuthorization>;
}): ProjectData => ({
  id,
  name,
  config,
  rules,
  assetsText,
  tags,
  authorization,
  savedAt: new Date().toISOString(),
});

export const readBrowserProjects = (): ProjectData[] => {
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is ProjectData =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ProjectData).id === "string" &&
        typeof (item as ProjectData).name === "string",
    );
  } catch {
    return [];
  }
};

export const writeBrowserProjects = (projects: ProjectData[]) => {
  try {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // 存储不可用时静默降级，项目历史不阻塞主流程。
  }
};

export const browserSaveProject = (project: ProjectData): ProjectMeta[] => {
  const projects = readBrowserProjects();
  const next = [project, ...projects.filter((item) => item.id !== project.id)].slice(0, 12);
  writeBrowserProjects(next);
  return next.map(toMeta);
};

export const browserDeleteProject = (id: string): ProjectMeta[] => {
  const next = readBrowserProjects().filter((item) => item.id !== id);
  writeBrowserProjects(next);
  return next.map(toMeta);
};

export const browserLoadProject = (id: string): ProjectData | null => {
  return readBrowserProjects().find((item) => item.id === id) ?? null;
};

export const browserListProjects = (): ProjectMeta[] => readBrowserProjects().map(toMeta);

const toMeta = (project: ProjectData): ProjectMeta => ({
  id: project.id,
  name: project.name,
  savedAt: project.savedAt,
});
