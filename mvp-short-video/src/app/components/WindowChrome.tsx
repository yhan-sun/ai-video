import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktopPlatform, type DesktopPlatform } from "../desktop.ts";

// 自绘窗口 chrome：去掉系统白色标题栏方框，支持透明窗口。
// macOS 用 Overlay 标题栏保留原生红绿灯（左侧留白）；其余平台去掉系统装饰，
// 由这里提供最小化 / 最大化 / 关闭按钮与拖拽区域。
const withCurrentWindow = async (
  action: (window: ReturnType<typeof getCurrentWindow>) => Promise<void>,
) => {
  await action(getCurrentWindow());
};

const toggleMaximize = async () => {
  await withCurrentWindow(async (window) => {
    if (await window.isMaximized()) {
      await window.unmaximize();
    } else {
      await window.maximize();
    }
  });
};

export const WindowChrome = () => {
  const platform: DesktopPlatform = desktopPlatform();

  useEffect(() => {
    if (platform === "web") {
      return undefined;
    }
    const applyMaximizedState = async () => {
      const window = getCurrentWindow();
      const maximized = await window.isMaximized();
      document.documentElement.classList.toggle("window-maximized", maximized);
    };
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onResized(() => {
        void applyMaximizedState();
      })
      .then((fn) => {
        unlisten = fn;
      });
    void applyMaximizedState();
    return () => {
      unlisten?.();
    };
  }, [platform]);

  useEffect(() => {
    if (platform === "web") {
      return;
    }
    void invoke("window_chrome_ready").catch((error) => {
      console.error("应用窗口 chrome 失败", error);
    });
  }, [platform]);

  if (platform === "web") {
    return null;
  }

  const handleDoubleClick = () => {
    if (platform !== "macos") {
      void toggleMaximize();
    }
  };

  return (
    <div
      className={"window-chrome window-chrome-" + platform}
      onDoubleClick={handleDoubleClick}
      role="presentation"
    >
      <div className="window-drag-region" data-tauri-drag-region role="presentation" />
      {platform === "macos" ? (
        <span className="window-chrome-label">Clips Studio</span>
      ) : (
        <div className="window-controls" data-no-window-drag>
          <button
            type="button"
            className="window-control"
            aria-label="最小化窗口"
            title="最小化"
            onClick={() => void withCurrentWindow((window) => window.minimize())}
          >
            −
          </button>
          <button
            type="button"
            className="window-control"
            aria-label="最大化或还原窗口"
            title="最大化或还原"
            onClick={() => void toggleMaximize()}
          >
            ▢
          </button>
          <button
            type="button"
            className="window-control window-control-close"
            aria-label="关闭窗口"
            title="关闭"
            onClick={() => void withCurrentWindow((window) => window.close())}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
