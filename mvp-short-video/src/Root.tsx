import { CalculateMetadataFunction, Composition } from "remotion";
import { TimelineSchema, defaultTimeline, type Timeline } from "./campaign.ts";
import { VerticalDraft } from "./VerticalDraft.tsx";

export const calculateMetadata: CalculateMetadataFunction<Timeline> = ({ props }) => {
  const timeline = TimelineSchema.parse(props);
  const fps = timeline.fps ?? 30;
  const durationInFrames = timeline.scenes.reduce(
    (total, scene) => total + Math.round(scene.duration * fps),
    0,
  );

  return {
    durationInFrames,
    fps,
    width: timeline.width,
    height: timeline.height,
    props: timeline,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VerticalDraft"
      component={VerticalDraft}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
      schema={TimelineSchema}
      calculateMetadata={calculateMetadata}
      defaultProps={defaultTimeline}
    />
  );
};
