import React, { useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { type Scene, type SceneMedia, type Timeline } from "./campaign.ts";
import { VIDEO_TOKENS, headlineFontSize, sceneColor, subtitleFontSize } from "./contract/tokens.ts";
import "./style.css";

const sceneTypeLabel: Record<Scene["type"], string> = {
  hook: "钩子",
  pain: "痛点",
  proof: "证据",
  offer: "价值",
  cta: "转化",
};

const assetSrc = (asset?: string) => {
  if (!asset) {
    return null;
  }

  if (asset.startsWith("http://") || asset.startsWith("https://")) {
    return asset;
  }

  return staticFile(asset.replace(/^public\//, ""));
};

const BackgroundAsset: React.FC<{ scene: Scene }> = ({ scene }) => {
  const src = assetSrc(scene.asset);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [failed, setFailed] = useState(false);
  const zoom = interpolate(frame, [0, scene.duration * fps], [1.03, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const media: SceneMedia | undefined = scene.media;
  const objectFit = media?.objectFit ?? "cover";
  const objectPosition = media?.objectPosition ?? "center";

  const mediaStyle: React.CSSProperties = {
    transform: "scale(" + zoom + ")",
    objectFit,
    objectPosition,
  };

  if (!src || scene.assetType === "none" || failed) {
    return (
      <AbsoluteFill
        className="fallback-bg"
        style={
          {
            "--accent": sceneColor(scene.type, scene.color),
          } as React.CSSProperties
        }
      >
        {failed ? <div className="media-failed">素材缺失或已损坏</div> : null}
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="texture" />
      </AbsoluteFill>
    );
  }

  if (scene.assetType === "video") {
    const trimBefore = Math.round((media?.trimStart ?? 0) * fps);
    const trimAfter = Math.round((media?.trimEnd ?? scene.duration) * fps);
    const playbackRate = media?.playbackRate ?? 1;
    const volume = media?.volume ?? 0;
    const muted = media?.muted ?? volume === 0;

    return (
      <Video
        className="scene-media"
        src={src}
        muted={muted}
        loop
        volume={volume}
        playbackRate={playbackRate}
        trimBefore={trimBefore}
        trimAfter={trimAfter}
        style={mediaStyle}
        onError={() => {
          setFailed(true);
          return "fallback";
        }}
      />
    );
  }

  return (
    <Img className="scene-media" src={src} style={mediaStyle} onError={() => setFailed(true)} />
  );
};

const SceneCard: React.FC<{
  scene: Scene;
  merchant: Timeline["merchant"];
  index: number;
  total: number;
}> = ({ scene, merchant, index, total }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, VIDEO_TOKENS.enterFrames], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(enter, [0, 1], [52, 0]);
  const headline = scene.headline.trim();
  const subtitle = (scene.subtitle ?? "").trim();

  return (
    <AbsoluteFill>
      <BackgroundAsset scene={scene} />
      <AbsoluteFill className="scrim" />

      <div className="topbar">
        <span>{merchant.location}</span>
        <span>{merchant.industry}</span>
      </div>

      <div className="progress">
        {Array.from({ length: total }).map((_, itemIndex) => (
          <span key={itemIndex} className={itemIndex <= index ? "active" : undefined} />
        ))}
      </div>

      <div
        className="copy-block"
        style={{
          transform: "translateY(" + titleY + "px)",
          opacity: enter,
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        <div className="badge" style={{ background: sceneColor(scene.type, scene.color) }}>
          {scene.badge ?? sceneTypeLabel[scene.type]}
        </div>
        <h1 style={{ fontSize: headlineFontSize(headline.length) }}>{headline}</h1>
        {subtitle ? (
          <p style={{ fontSize: subtitleFontSize(subtitle.length) }}>{subtitle}</p>
        ) : null}
      </div>

      <div className="merchant-card">
        <div>
          <strong>{merchant.name}</strong>
          <span>{merchant.audience}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const VerticalDraft: React.FC<Timeline> = ({ scenes, merchant }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill className="video">
      {scenes.map((scene, index) => {
        const from = scenes
          .slice(0, index)
          .reduce((sum, item) => sum + Math.round(item.duration * fps), 0);
        const durationInFrames = Math.round(scene.duration * fps);

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={durationInFrames}
            premountFor={fps}
          >
            <SceneCard scene={scene} merchant={merchant} index={index} total={scenes.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
