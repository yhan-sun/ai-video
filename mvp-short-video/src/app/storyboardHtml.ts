import { VIDEO_TOKENS, sceneColor } from "../contract/tokens.ts";
import type { Timeline } from "../contract/schema.ts";
import { assetFileName, assetSource, durationOf, sceneTimings } from "./format.ts";
import { sceneLabel } from "./types.ts";

export const storyboardHtml = (timeline: Timeline, options: { title?: string } = {}) => {
  const total = durationOf(timeline);
  const scenes = sceneTimings(timeline).map(({ scene, label }) => ({
    scene,
    label,
    fileName: scene.asset ? assetFileName(scene.asset) : "占位素材 / 稍后补",
    src: scene.asset && scene.assetType !== "none" ? assetSource(scene.asset) : null,
    color: sceneColor(scene.type, scene.color),
    badge: scene.badge,
    typeLabel: sceneLabel[scene.type],
    headline: scene.headline.trim(),
    subtitle: (scene.subtitle ?? "").trim(),
  }));

  const cards = scenes
    .map(
      (item, index) => `
    <article class="card">
      <div class="phone" style="--accent: ${item.color}">
        ${item.src ? `<img src="${item.src}" alt="" loading="lazy" />` : `<div class="placeholder">占位</div>`}
        <div class="shade"></div>
        <span class="badge" style="background: ${item.color}">${item.badge ?? item.typeLabel}</span>
        <h3>${escapeHtml(item.headline)}</h3>
        ${item.subtitle ? `<p>${escapeHtml(item.subtitle)}</p>` : ""}
        <small>${escapeHtml(timeline.merchant.name)} · ${escapeHtml(timeline.merchant.location)}</small>
      </div>
      <div class="meta">
        <strong>${String(index + 1).padStart(2, "0")} ${item.typeLabel}</strong>
        <span>${item.label} · ${item.fileName}</span>
      </div>
    </article>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title ?? timeline.title)} · Storyboard</title>
<style>
  :root {
    --safe-top: ${VIDEO_TOKENS.safeTop}px;
    --safe-bottom: ${VIDEO_TOKENS.safeBottom}px;
    --radius: ${VIDEO_TOKENS.radius}px;
    --font: ${VIDEO_TOKENS.fontFamily};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 48px 32px;
    background: #f5f5f7;
    color: #1d1d1f;
    font-family: var(--font);
  }
  header h1 { font-size: 22px; margin: 0 0 4px; }
  header p { margin: 0; color: #6e6e73; font-size: 13px; }
  .strip {
    display: flex;
    gap: 6px;
    margin: 18px 0 28px;
    align-items: center;
  }
  .strip .block {
    height: 14px;
    border-radius: 4px;
    background: #e8e8ed;
  }
  .strip small { color: #6e6e73; font-size: 12px; margin-left: 8px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(236px, 1fr));
    gap: 20px;
  }
  .card {
    background: #ffffff;
    border: 1px solid #e8e8ed;
    border-radius: 14px;
    padding: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  }
  .phone {
    position: relative;
    aspect-ratio: 9 / 16;
    overflow: hidden;
    border-radius: calc(var(--radius) - 8px);
    background:
      radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 36%),
      #101014;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0 14px 30px;
  }
  .phone img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .phone .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.55);
    font-size: 12px;
    letter-spacing: 0.1em;
  }
  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(0deg, rgba(0, 0, 0, 0.85), transparent 62%);
  }
  .badge {
    position: relative;
    align-self: flex-start;
    padding: 3px 10px;
    border-radius: 999px;
    color: #111;
    font-size: 10px;
    font-weight: 800;
    margin-bottom: 8px;
  }
  .phone h3 {
    position: relative;
    margin: 0;
    font-size: 16px;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  .phone p {
    position: relative;
    margin: 6px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.82);
  }
  .phone small {
    position: relative;
    margin-top: 10px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.65);
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 4px 2px;
    font-size: 11px;
    color: #6e6e73;
  }
  .meta strong { color: #1d1d1f; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(timeline.title)}</h1>
  <p>${escapeHtml(timeline.merchant.name)} · ${escapeHtml(timeline.merchant.location)} · 9:16 · 共 ${total}s · 5 分镜 · schemaVersion ${timeline.schemaVersion}</p>
</header>
<div class="strip">
  ${scenes
    .map(
      (item) =>
        `<div class="block" style="width: ${Math.round((item.scene.duration / total) * 100)}%; background: ${item.color}"></div>`,
    )
    .join("")}
  <small>总时长 ${total}s</small>
</div>
<div class="grid">
${cards}
</div>
</body>
</html>`;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
