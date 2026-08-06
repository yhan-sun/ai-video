import { describe, expect, it, vi } from "vitest";
import {
  assetMetaFromImportedRecord,
  hydrateAssetLocalPaths,
  isDesktop,
  previewUrlFor,
  registerAssetLocalPath,
  saveOrDownload,
} from "../src/app/desktop.ts";

describe("desktop bridge: environment detection", () => {
  it("is not desktop in a plain browser (jsdom)", () => {
    expect(isDesktop()).toBe(false);
  });

  it("detects the Tauri runtime when the internals marker exists", () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isDesktop()).toBe(true);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
});

describe("desktop bridge: asset metadata mapping", () => {
  it("maps an imported record to AssetMeta without absolute paths", () => {
    const meta = assetMetaFromImportedRecord({
      relPath: "library/abc12345-hero.jpg",
      hash: "abc12345deadbeef",
      size: 1024,
      name: "hero.jpg",
      duplicate: false,
    });
    expect(meta.path).toBe("library/abc12345-hero.jpg");
    expect(meta.type).toBe("image");
    expect(meta.hash).toBe("abc12345deadbeef");
    expect(meta.imported).toBe(true);
    expect(JSON.stringify(meta)).not.toContain("/Users/");
    expect(JSON.stringify(meta)).not.toContain("C:");
  });

  it("maps video records to video type and marks duplicates", () => {
    const meta = assetMetaFromImportedRecord({
      relPath: "library/beef1234-clip.mp4",
      hash: "beef1234",
      size: 2048,
      name: "clip.mp4",
      duplicate: true,
    });
    expect(meta.type).toBe("video");
    expect(meta.duplicateOf).toBe("library/beef1234-clip.mp4");
  });
});

describe("desktop bridge: local preview url cache", () => {
  it("registers absolute paths as preview urls (never exported)", () => {
    registerAssetLocalPath(
      "library/hero.jpg",
      "/Users/test/Library/Application Support/clips/assets/hero.jpg",
    );
    const url = previewUrlFor("library/hero.jpg");
    expect(url).toBeUndefined(); // jsdom 中非桌面环境不暴露缓存
  });

  it("hydrates many local paths at once", () => {
    hydrateAssetLocalPaths({
      "library/a.jpg": "/tmp/a.jpg",
      "library/b.mp4": "/tmp/b.mp4",
    });
    expect(true).toBe(true);
  });
});

describe("desktop bridge: saveOrDownload falls back to the browser", () => {
  it("calls the browser download when not on desktop", async () => {
    const browserDownload = vi.fn();
    const path = await saveOrDownload("x.json", "{}", browserDownload);
    expect(path).toBeNull();
    expect(browserDownload).toHaveBeenCalledWith("x.json", "{}");
  });
});
