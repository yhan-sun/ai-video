#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./timeline-core.mjs";

const inputPath = process.argv[2] ?? "data/sample.timeline.json";
const outputPath = process.argv[3] ?? "out/storyboard.html";
const timeline = readJson(inputPath);

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const assetHtml = (scene) => {
  if (!scene.asset || scene.assetType === "none") {
    return (
      '<div class="placeholder"><span>' + escapeHtml(scene.badge || scene.type) + "</span></div>"
    );
  }

  const src = "../public/" + scene.asset;
  if (scene.assetType === "video") {
    return '<video src="' + escapeHtml(src) + '" muted loop playsinline></video>';
  }

  return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(scene.headline) + '" />';
};

const scenes = timeline.scenes
  .map((scene, index) =>
    [
      '<article class="scene">',
      '  <div class="phone">',
      "    " + assetHtml(scene),
      '    <div class="shade"></div>',
      '    <div class="badge" style="background:' +
        escapeHtml(scene.color) +
        '">' +
        escapeHtml(scene.badge || scene.type) +
        "</div>",
      "    <h2>" + escapeHtml(scene.headline) + "</h2>",
      "    <p>" + escapeHtml(scene.subtitle || "") + "</p>",
      "    <footer>" +
        escapeHtml(timeline.merchant.name) +
        " · " +
        escapeHtml(timeline.merchant.location) +
        "</footer>",
      "  </div>",
      '  <div class="meta"><strong>' +
        String(index + 1).padStart(2, "0") +
        " / " +
        escapeHtml(scene.type) +
        "</strong><span>" +
        escapeHtml(scene.duration) +
        "s</span></div>",
      "</article>",
    ].join("\n"),
  )
  .join("\n");

const html = [
  "<!doctype html>",
  '<html lang="zh-CN">',
  "<head>",
  '  <meta charset="utf-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
  "  <title>" + escapeHtml(timeline.title) + " - Storyboard</title>",
  "  <style>",
  "    * { box-sizing: border-box; }",
  '    body { margin: 0; background: #0f1117; color: #f8fafc; font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }',
  "    main { max-width: 1280px; margin: 0 auto; padding: 40px 28px 64px; }",
  "    .hero { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; align-items: end; margin-bottom: 28px; }",
  "    h1 { margin: 0; font-size: clamp(32px, 5vw, 64px); line-height: 1.05; letter-spacing: -0.05em; }",
  "    .summary { color: #cbd5e1; font-size: 17px; line-height: 1.7; }",
  "    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 22px; }",
  "    .phone { position: relative; aspect-ratio: 9/16; border-radius: 28px; overflow: hidden; background: linear-gradient(135deg, #1f2937, #111827); box-shadow: 0 24px 80px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.12); }",
  "    img, video { width: 100%; height: 100%; object-fit: cover; display: block; }",
  "    .placeholder { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(circle at 25% 20%, rgba(255,221,45,.42), transparent 34%), radial-gradient(circle at 80% 70%, rgba(96,165,250,.35), transparent 32%), linear-gradient(135deg, #111827, #312e81); }",
  "    .placeholder span { font-size: 32px; font-weight: 900; opacity: .7; }",
  "    .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.2), transparent 35%, rgba(0,0,0,.86)); }",
  "    .badge { position: absolute; left: 18px; bottom: 164px; color: #111; border-radius: 999px; padding: 8px 14px; font-weight: 900; font-size: 14px; }",
  "    h2 { position: absolute; left: 18px; right: 18px; bottom: 76px; margin: 0; font-size: 25px; line-height: 1.08; letter-spacing: -.04em; }",
  "    p { position: absolute; left: 18px; right: 18px; bottom: 42px; margin: 0; color: rgba(255,255,255,.82); font-size: 13px; line-height: 1.3; }",
  "    footer { position: absolute; left: 18px; right: 18px; bottom: 18px; color: rgba(255,255,255,.62); font-size: 11px; }",
  "    .meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; color: #94a3b8; font-size: 13px; }",
  "    .copy { margin-top: 34px; padding: 24px; border: 1px solid rgba(255,255,255,.12); border-radius: 22px; background: rgba(255,255,255,.06); }",
  "    .copy h3 { margin: 0 0 12px; }",
  "    pre { white-space: pre-wrap; color: #dbeafe; font-size: 15px; line-height: 1.6; margin: 0; }",
  "    @media (max-width: 760px) { .hero { grid-template-columns: 1fr; } }",
  "  </style>",
  "</head>",
  "<body>",
  "  <main>",
  '    <section class="hero">',
  "      <div>",
  "        <h1>" + escapeHtml(timeline.title) + "</h1>",
  '        <p class="summary">' +
    escapeHtml(timeline.merchant.industry) +
    "｜" +
    escapeHtml(timeline.merchant.location) +
    "｜" +
    escapeHtml(timeline.merchant.audience) +
    "</p>",
  "      </div>",
  '      <p class="summary">这不是“保证爆款”的承诺，而是一条可审核、可替换素材、可渲染的短视频草稿。</p>',
  "    </section>",
  '    <section class="grid">' + scenes + "</section>",
  '    <section class="copy"><h3>发布文案</h3><pre>' +
    escapeHtml(
      timeline.publishCopy.title +
        "\n\n" +
        timeline.publishCopy.body +
        "\n\n" +
        timeline.publishCopy.hashtags.join(" "),
    ) +
    "</pre></section>",
  "  </main>",
  "</body>",
  "</html>",
].join("\n");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);
console.log("Storyboard written to " + outputPath);
