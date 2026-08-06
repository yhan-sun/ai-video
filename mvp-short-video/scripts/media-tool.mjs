#!/usr/bin/env node
// 媒体工具 CLI：probe / slice / transcribe，与桌面端 Rust 命令同参数语义。
// 用法：
//   node scripts/media-tool.mjs probe <video>
//   node scripts/media-tool.mjs slice <video> <start秒> <时长秒> -o out.mp4 [--thumb out.jpg]
//   node scripts/media-tool.mjs transcribe <video-or-audio> -o out.srt [--model models/ggml-base.bin]
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";

const execFileAsync = promisify(execFile);

const detect = async (names) => {
  for (const name of names) {
    try {
      await execFileAsync(name, ["-version"], { timeout: 15000 });
      return name;
    } catch {
      // try next
    }
  }
  return null;
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const srtTimestamp = (seconds) => {
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(command + " 退出码 " + code)),
    );
    child.on("error", reject);
  });

const probe = async (input) => {
  const ffprobe = await detect(["ffprobe"]);
  if (!ffprobe) fail("未检测到 ffprobe，请先安装 FFmpeg。");
  const { stdout } = await execFileAsync(
    ffprobe,
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout);
  const video = (parsed.streams ?? []).find((stream) => stream.codec_type === "video");
  console.log(
    JSON.stringify(
      {
        duration: parsed.format?.duration ? Number(parsed.format.duration) : undefined,
        width: video?.width,
        height: video?.height,
        codec: video?.codec_name,
        size: parsed.format?.size ? Number(parsed.format.size) : undefined,
      },
      null,
      2,
    ),
  );
};

const slice = async (input, start, duration, output, thumb) => {
  const ffmpeg = await detect(["ffmpeg"]);
  if (!ffmpeg) fail("未检测到 ffmpeg，请先安装 FFmpeg（brew install ffmpeg）。");
  const args = [
    "-y",
    "-ss",
    String(start),
    "-i",
    input,
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    output,
  ];
  console.log("切片中：", input, "→", output);
  await run(ffmpeg, args);
  if (thumb) {
    await run(ffmpeg, [
      "-y",
      "-ss",
      "0.5",
      "-i",
      output,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:-2",
      thumb,
    ]);
    console.log("缩略图：", thumb);
  }
  console.log("完成：", output);
};

const transcribe = async (input, output, model) => {
  const ffmpeg = await detect(["ffmpeg"]);
  const whisper = await detect(["whisper-cli", "whisper", "whisper-cpp"]);
  if (!ffmpeg || !whisper) {
    fail("转写需要 ffmpeg 与 whisper（whisper.cpp）：brew install ffmpeg whisper-cpp");
  }
  const tmpWav = output.replace(/\.srt$/, "") + "-audio.wav";
  const prefix = output.replace(/\.srt$/, "") + "-whisper";
  console.log("提取音频：", tmpWav);
  await run(ffmpeg, ["-y", "-i", input, "-ar", "16000", "-ac", "1", tmpWav]);
  console.log("转写中（模型 " + (model ?? "models/ggml-base.bin") + "）…");
  await run(whisper, ["-m", model ?? "models/ggml-base.bin", "-f", tmpWav, "-oj", "-of", prefix]);
  const parsed = JSON.parse(readFileSync(prefix + ".json", "utf8"));
  const segments = (parsed.transcription ?? [])
    .map((item) => ({
      start: (item.offsets?.from ?? 0) / 1000,
      end: (item.offsets?.to ?? 0) / 1000,
      text: (item.text ?? "").trim(),
    }))
    .filter((item) => item.text.length > 0);
  let srt = "";
  segments.forEach((segment, index) => {
    srt += `${index + 1}\n${srtTimestamp(segment.start)} --> ${srtTimestamp(segment.end)}\n${segment.text}\n\n`;
  });
  writeFileSync(output, srt);
  console.log(
    "完成：" +
      output +
      "（" +
      segments.length +
      " 条字幕，" +
      (parsed.result?.language ?? "未知") +
      "）",
  );
};

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "probe":
    probe(rest[0]).catch((error) => fail(String(error)));
    break;
  case "slice": {
    const input = rest[0];
    const start = Number(rest[1] ?? 0);
    const duration = Number(rest[2] ?? 5);
    const outputIndex = rest.indexOf("-o");
    const output = outputIndex >= 0 ? rest[outputIndex + 1] : "out/clip.mp4";
    const thumbIndex = rest.indexOf("--thumb");
    const thumb = thumbIndex >= 0 ? rest[thumbIndex + 1] : null;
    slice(input, start, duration, output, thumb).catch((error) => fail(String(error)));
    break;
  }
  case "transcribe": {
    const input = rest[0];
    const outputIndex = rest.indexOf("-o");
    const output = outputIndex >= 0 ? rest[outputIndex + 1] : "out/subtitles.srt";
    const modelIndex = rest.indexOf("--model");
    const model = modelIndex >= 0 ? rest[modelIndex + 1] : undefined;
    transcribe(input, output, model).catch((error) => fail(String(error)));
    break;
  }
  default:
    fail("用法：media-tool.mjs probe|slice|transcribe …（见文件头注释）");
}
