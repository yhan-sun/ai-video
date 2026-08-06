// 草稿差异对比：分镜/发布文案/素材/时长的字段级 diff，供审校使用。
import type { Scene, Timeline } from "../contract/schema.ts";
import { normalizeAssetPath } from "./format.ts";

export type SceneDiff = {
  sceneId: string;
  typeA?: Scene["type"];
  typeB?: Scene["type"];
  headlineA?: string;
  headlineB?: string;
  subtitleA?: string;
  subtitleB?: string;
  durationA?: number;
  durationB?: number;
  assetA?: string;
  assetB?: string;
  changed: Array<"type" | "headline" | "subtitle" | "duration" | "asset">;
  missingInB: boolean;
};

export type PublishCopyDiff = {
  titleChanged: boolean;
  bodyChanged: boolean;
  commentPromptChanged: boolean;
  hashtagsChanged: boolean;
};

export type DraftDiff = {
  sceneDiffs: SceneDiff[];
  publish: PublishCopyDiff;
  totalDurationA: number;
  totalDurationB: number;
  durationDelta: number;
  changedScenes: number;
  sceneCountA: number;
  sceneCountB: number;
  assetChanges: number;
  changedFieldCount: number;
  identical: boolean;
};

export const diffScenes = (a: Timeline, b: Timeline): SceneDiff[] => {
  const byId = new Map(b.scenes.map((scene) => [scene.id, scene]));

  return a.scenes.map((sceneA) => {
    const sceneB = byId.get(sceneA.id);
    if (!sceneB) {
      return {
        sceneId: sceneA.id,
        headlineA: sceneA.headline,
        subtitleA: sceneA.subtitle,
        durationA: sceneA.duration,
        assetA: sceneA.asset,
        changed: ["headline", "subtitle", "duration", "asset"],
        missingInB: true,
      };
    }

    const changed: SceneDiff["changed"] = [];
    if (sceneA.type !== sceneB.type) {
      changed.push("type");
    }
    if (sceneA.headline !== sceneB.headline) {
      changed.push("headline");
    }
    if ((sceneA.subtitle ?? "") !== (sceneB.subtitle ?? "")) {
      changed.push("subtitle");
    }
    if (sceneA.duration !== sceneB.duration) {
      changed.push("duration");
    }
    if (normalizeAssetPath(sceneA.asset ?? "") !== normalizeAssetPath(sceneB.asset ?? "")) {
      changed.push("asset");
    }

    return {
      sceneId: sceneA.id,
      typeA: sceneA.type,
      typeB: sceneB.type,
      headlineA: sceneA.headline,
      headlineB: sceneB.headline,
      subtitleA: sceneA.subtitle,
      subtitleB: sceneB.subtitle,
      durationA: sceneA.duration,
      durationB: sceneB.duration,
      assetA: sceneA.asset,
      assetB: sceneB.asset,
      changed,
      missingInB: false,
    };
  });
};

export const diffPublishCopy = (a: Timeline, b: Timeline): PublishCopyDiff => ({
  titleChanged: a.publishCopy.title !== b.publishCopy.title,
  bodyChanged: a.publishCopy.body !== b.publishCopy.body,
  commentPromptChanged: a.publishCopy.commentPrompt !== b.publishCopy.commentPrompt,
  hashtagsChanged: a.publishCopy.hashtags.join(" ") !== b.publishCopy.hashtags.join(" "),
});

export const buildDraftDiff = (a: Timeline, b: Timeline): DraftDiff => {
  const sceneDiffs = diffScenes(a, b);
  const publish = diffPublishCopy(a, b);
  const totalDurationA = a.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const totalDurationB = b.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const changedScenes = sceneDiffs.filter(
    (scene) => scene.changed.length > 0 || scene.missingInB,
  ).length;
  const assetChanges = sceneDiffs.filter((scene) => scene.changed.includes("asset")).length;
  const changedFieldCount =
    sceneDiffs.reduce((sum, scene) => sum + scene.changed.length, 0) +
    Object.values(publish).filter(Boolean).length;

  return {
    sceneDiffs,
    publish,
    totalDurationA,
    totalDurationB,
    durationDelta: totalDurationB - totalDurationA,
    changedScenes,
    sceneCountA: a.scenes.length,
    sceneCountB: b.scenes.length,
    assetChanges,
    changedFieldCount,
    identical:
      changedFieldCount === 0 &&
      a.scenes.length === b.scenes.length &&
      totalDurationA === totalDurationB,
  };
};

export const changedFieldLabel: Record<SceneDiff["changed"][number], string> = {
  type: "类型",
  headline: "画面大字",
  subtitle: "辅助文案",
  duration: "时长",
  asset: "素材",
};
