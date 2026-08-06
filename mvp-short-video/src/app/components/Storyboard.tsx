import type { Timeline } from "../../contract/schema.ts";
import { assetFileName, assetSource, durationOf, sceneTimings } from "../format.ts";
import { previewUrlFor } from "../desktop.ts";
import { sceneLabel } from "../types.ts";
import { StatusBadge } from "./ui.tsx";

const sceneMediaSrc = (asset?: string) =>
  asset ? (previewUrlFor(asset) ?? assetSource(asset)) : null;

export const ScenePreview = ({ timeline }: { timeline: Timeline }) => (
  <div className="storyboardRail">
    {sceneTimings(timeline).map(({ scene, label }, index) => (
      <article className="sceneCard" key={scene.id}>
        <div className="phoneCanvas">
          {scene.asset && scene.assetType === "image" ? (
            <img src={sceneMediaSrc(scene.asset) ?? undefined} alt={scene.headline} />
          ) : scene.asset && scene.assetType === "video" ? (
            <video src={sceneMediaSrc(scene.asset) ?? undefined} muted playsInline />
          ) : (
            <div className="phonePlaceholder" />
          )}
          <div className="phoneShade" />
          <span className="sceneBadge" style={{ background: scene.color }}>
            {scene.badge ?? sceneLabel[scene.type]}
          </span>
          <h3>{scene.headline}</h3>
          <p>{scene.subtitle}</p>
          <small>
            {timeline.merchant.name} · {timeline.merchant.location}
          </small>
        </div>
        <div className="sceneMeta">
          <strong>
            {String(index + 1).padStart(2, "0")} {sceneLabel[scene.type]}
          </strong>
          <span>{label}</span>
        </div>
      </article>
    ))}
  </div>
);

export const TimelineStrip = ({ timeline }: { timeline: Timeline }) => {
  const total = durationOf(timeline);

  return (
    <div className="timelineStrip" aria-label="当前草稿时间线">
      {sceneTimings(timeline).map(({ scene, label }) => (
        <div
          className="timelineBlock"
          key={scene.id}
          style={{ flexGrow: scene.duration, borderColor: scene.color }}
        >
          <strong>{sceneLabel[scene.type]}</strong>
          <span>{label}</span>
        </div>
      ))}
      <small>总时长 {total}s</small>
    </div>
  );
};

export const StoryboardPreview = ({
  timeline,
  eyebrow = "9:16 Storyboard",
  title = "当前草稿预览",
}: {
  timeline: Timeline;
  eyebrow?: string;
  title?: string;
}) => (
  <section className="previewStack">
    <div className="miniHeader">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <StatusBadge tone="info">{durationOf(timeline)}s</StatusBadge>
    </div>
    <TimelineStrip timeline={timeline} />
    <ScenePreview timeline={timeline} />
  </section>
);

export const assetFileLabel = (asset?: string) =>
  asset ? assetFileName(asset) : "占位素材 / 稍后补";
