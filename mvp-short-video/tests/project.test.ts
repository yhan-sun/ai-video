import { beforeEach, describe, expect, it } from "vitest";
import {
  browserDeleteProject,
  browserListProjects,
  browserLoadProject,
  browserSaveProject,
  buildProjectSnapshot,
  PROJECTS_STORAGE_KEY,
  readBrowserProjects,
} from "../src/app/projectStore.ts";
import { sampleConfig } from "../src/app/timeline.ts";

const rules = {
  count: 4,
  templateIds: ["checklist"] as const,
  tone: "direct" as const,
  minDuration: 20,
  maxDuration: 20,
  seed: 3,
};

describe("project store: snapshot building", () => {
  it("builds a snapshot without drafts, edits or thumbnails", () => {
    const snapshot = buildProjectSnapshot({
      id: "project-x",
      name: "测试茶馆",
      config: sampleConfig,
      rules,
      assetsText: "assets/a.jpg\nassets/b.mp4",
      tags: { "assets/a.jpg": ["环境"] },
      authorization: { "assets/a.jpg": { status: "authorized" } },
    });
    expect(snapshot.id).toBe("project-x");
    expect(snapshot.name).toBe("测试茶馆");
    expect(snapshot.config.name).toBe(sampleConfig.name);
    expect(snapshot.rules.seed).toBe(3);
    expect(snapshot.savedAt).toBeTruthy();
    expect(JSON.stringify(snapshot)).not.toContain("/Users/");
    expect(JSON.stringify(snapshot)).not.toContain("thumbnail");
  });
});

describe("project store: browser localStorage CRUD", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves, lists, loads and deletes projects", () => {
    const first = buildProjectSnapshot({
      id: "p1",
      name: "民宿A",
      config: sampleConfig,
      rules,
      assetsText: "",
      tags: {},
      authorization: {},
    });
    const second = buildProjectSnapshot({
      id: "p2",
      name: "茶馆B",
      config: sampleConfig,
      rules,
      assetsText: "",
      tags: {},
      authorization: {},
    });

    browserSaveProject(first);
    browserSaveProject(second);

    const metas = browserListProjects();
    expect(metas).toHaveLength(2);
    expect(metas[0].name).toBe("茶馆B");

    expect(browserLoadProject("p1")?.name).toBe("民宿A");
    expect(browserLoadProject("missing")).toBeNull();

    browserDeleteProject("p1");
    expect(browserListProjects()).toHaveLength(1);
    expect(readBrowserProjects()[0].id).toBe("p2");
  });

  it("upserts by id and caps the list", () => {
    for (let index = 0; index < 16; index += 1) {
      browserSaveProject(
        buildProjectSnapshot({
          id: "p" + index,
          name: "项目" + index,
          config: sampleConfig,
          rules,
          assetsText: "",
          tags: {},
          authorization: {},
        }),
      );
    }
    const projects = readBrowserProjects();
    expect(projects).toHaveLength(12);
    expect(projects[0].id).toBe("p15");
    expect(window.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeTruthy();
  });

  it("ignores corrupted localStorage content", () => {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, "{not json");
    expect(readBrowserProjects()).toEqual([]);
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([{ name: "缺 id" }]));
    expect(readBrowserProjects()).toEqual([]);
  });
});
