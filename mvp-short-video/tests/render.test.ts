import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTimeline } from "../src/contract/schema.ts";
import { calculateMetadata } from "../src/Root.tsx";
import { buildTimeline, sampleAssets, sampleConfig } from "../src/app/timeline.ts";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runBundle = () =>
  execFileAsync("npx", ["remotion", "bundle", "src/index.ts"], {
    cwd: projectRoot,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });

describe("minimal render pipeline", () => {
  it("computes composition metadata from the shared contract", async () => {
    const timeline = parseTimeline(buildTimeline(sampleConfig, sampleAssets, 0));
    const metadata = await calculateMetadata({ props: timeline });

    const expectedFrames = timeline.scenes.reduce(
      (total, scene) => total + Math.round(scene.duration * timeline.fps),
      0,
    );
    expect(metadata.durationInFrames).toBe(expectedFrames);
    expect(metadata.fps).toBe(30);
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
    expect(metadata.props.scenes).toHaveLength(5);
  });

  it("bundles the Remotion entry without a browser (composition is renderable)", async () => {
    const { stdout, stderr } = await runBundle();
    const output = stdout + stderr;
    expect(output).toMatch(/○ .*\/build/);
    const bundleDir = path.join(projectRoot, "build");
    expect(fs.existsSync(path.join(bundleDir, "index.html"))).toBe(true);
  });

  it("renders the sample timeline file as a still frame", async () => {
    const samplePath = path.join(projectRoot, "data", "sample.timeline.json");
    expect(fs.existsSync(samplePath)).toBe(true);
    const timeline = parseTimeline(JSON.parse(fs.readFileSync(samplePath, "utf8")));

    const outputPath = path.join(projectRoot, "out", "render-test-preview.png");
    const { stdout, stderr } = await execFileAsync(
      "npx",
      [
        "remotion",
        "still",
        "src/index.ts",
        "VerticalDraft",
        outputPath,
        "--frame=0",
        "--props=data/sample.timeline.json",
      ],
      { cwd: projectRoot, timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );
    expect(stdout + stderr).toMatch(/Rendered/);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(1000);
    expect(timeline.schemaVersion).toBe(2);
  }, 180000);
});
