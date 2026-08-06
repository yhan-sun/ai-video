import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App.tsx";
import { ErrorBoundary } from "../src/app/ErrorBoundary.tsx";

const openInspector = async () => {
  const inspector = await screen.findByTestId("draft-inspector");
  return inspector;
};

describe("App workbench shell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the three-part shell: sidebar, draft list and inspector", async () => {
    render(<App />);

    expect(screen.getByLabelText("产品导航")).toBeTruthy();
    expect(await screen.findByLabelText("草稿列表")).toBeTruthy();
    expect(screen.getByLabelText("草稿筛选")).toBeTruthy();

    const inspector = await openInspector();
    expect(inspector).toBeTruthy();
    expect(screen.getByTestId("publish-title")).toBeTruthy();
    expect(screen.getByLabelText("草稿检查器")).toBeTruthy();
  });

  it("lists 10 candidate drafts with template and status badges", async () => {
    render(<App />);

    await waitFor(() => {
      const draftList = screen.getByLabelText("草稿列表");
      expect(draftList.querySelectorAll('[role="option"]').length).toBe(10);
    });
    expect(screen.getByText("10/10 条候选 · 可筛选状态、排序、进入当前检查编辑。")).toBeTruthy();
  });

  it("keeps review pending and blocks export until approved", async () => {
    render(<App />);
    const inspector = await openInspector();

    const approveButton = screen.getByRole("button", { name: "标记审核通过" });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消审核通过" })).toBeTruthy();
    });
    expect(inspector.textContent).toContain("可导出");

    const titleInput = screen.getByTestId("publish-title") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "修改后的标题" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "标记审核通过" })).toBeTruthy();
    });
    expect(inspector.textContent).toContain("导出被阻止");
    expect(inspector.textContent).toContain("尚未人工审核通过");
  });

  it("resets review when a scene is edited", async () => {
    render(<App />);
    const inspector = await openInspector();

    fireEvent.click(screen.getByRole("button", { name: "标记审核通过" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消审核通过" })).toBeTruthy();
    });

    const headline = screen.getByTestId("scene-headline-hook") as HTMLInputElement;
    fireEvent.change(headline, { target: { value: "新的画面大字" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "标记审核通过" })).toBeTruthy();
    });
    expect(inspector.textContent).toContain("导出被阻止");
  });

  it("toggles review state back to pending on second click", async () => {
    render(<App />);
    await openInspector();

    fireEvent.click(screen.getByRole("button", { name: "标记审核通过" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消审核通过" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "取消审核通过" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "标记审核通过" })).toBeTruthy();
    });
  });

  it("opens navigation views from the sidebar", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /审核清单/ }));
    await waitFor(() => {
      expect(screen.getByText("当前草稿审核清单")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /素材库/ }));
    await waitFor(() => {
      expect(screen.getByText("客户授权素材")).toBeTruthy();
    });
  });

  it("exposes scene media controls and invalidates review on media edits", async () => {
    render(<App />);
    const inspector = await openInspector();

    fireEvent.click(screen.getByRole("button", { name: "标记审核通过" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消审核通过" })).toBeTruthy();
    });
    expect(inspector.textContent).toContain("可导出");

    const objectFit = screen.getAllByLabelText("裁切方式")[0] as HTMLSelectElement;
    expect(objectFit).toBeTruthy();
    fireEvent.change(objectFit, { target: { value: "contain" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "标记审核通过" })).toBeTruthy();
    });
    expect(inspector.textContent).toContain("导出被阻止");
  });
});

describe("App error boundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("shows a recoverable fallback instead of a blank screen", async () => {
    const Bomb = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText("工作台渲染失败")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试渲染" })).toBeTruthy();
  });
});

describe("App small-screen drawer behaviour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const mediaQuery = { matches: false, media: "", onchange: null };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mediaQuery));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hides the inspector until opened, then closes with the drawer button", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId("draft-inspector")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "检查当前" }));
    const inspector = await openInspector();
    expect(inspector).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "关闭检查器" }));
    await waitFor(() => {
      expect(screen.queryByTestId("draft-inspector")).toBeNull();
    });
  });
});

describe("App localStorage migration", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("migrates v2 workspace data and shows a visible notice", async () => {
    const legacy = {
      name: "测试商家",
      industry: "民宿",
      location: "云南大理",
      audience: "游客",
      keyword: "大理",
      hook: "旧钩子",
      sellingPoints: "离古城近",
      painPoints: "旺季吵",
      proofPoints: "口碑好",
      offer: "领路线",
      cta: "打大理",
      hashtags: "#大理",
      assets:
        "assets/hero-courtyard.svg\nassets/yard-view.svg\nassets/route-map.svg\nassets/review-proof.svg",
      selectedIndex: 0,
      activeView: "drafts",
      lastGenerated: "刚刚",
      generationCount: 10,
      selectedTemplateIds: ["avoid-mistake", "hidden-gem", "comparison", "checklist"],
      tone: "practical",
      minDuration: 18,
      maxDuration: 24,
      draftVariants: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      assetTags: {},
      draftEdits: {
        "3": {
          publishCopy: { title: "旧版本保存的标题" },
          reviewState: "approved",
          reviewedAt: "2026-08-01T00:00:00.000Z",
        },
      },
      draftHistory: {},
      savedBatches: [],
    };
    window.localStorage.setItem("clips-studio-workspace-v2", JSON.stringify(legacy));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/本地数据已从旧版本迁移/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText("旧版本保存的标题")).toBeTruthy();
    });
  });

  it("shows a visible notice when migration fails", async () => {
    window.localStorage.setItem(
      "clips-studio-workspace-v3",
      JSON.stringify({ workspaceVersion: 99, name: "未来版本" }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText(/迁移失败/).length).toBeGreaterThan(0);
    });
  });
});
