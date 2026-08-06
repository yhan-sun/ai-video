#!/usr/bin/env node
// 渲染任务执行器：读取 Web 导出的任务文件，运行 Remotion render，并把进度/日志/错误写回任务文件。
// 用法：node scripts/render-job.mjs <job.json> [--cancel]
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const cancel = process.argv.includes("--cancel");

const readJob = (path) => {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
};

const writeJob = (path, job) => {
  writeFileSync(path, JSON.stringify(job, null, 2));
};

const log = (...args) => console.log("[render-job]", ...args);

const main = async () => {
  const jobPath = process.argv[2];
  if (!jobPath) {
    console.error("用法：node scripts/render-job.mjs <job.json> [--cancel]");
    process.exit(1);
  }

  const job = readJob(jobPath);

  if (cancel) {
    job.status = "cancelled";
    job.log = [...(job.log ?? []), "已按请求取消任务。"];
    writeJob(jobPath, job);
    log("任务已标记为取消。");
    return;
  }

  if (job.status === "running") {
    console.error("任务已在运行中，不能重复启动。");
    process.exit(1);
  }

  const outputPath = job.outputPath ?? "out/vertical-draft.mp4";
  const propsPath = join(dirname(jobPath), "props-" + job.id + ".json");
  writeFileSync(propsPath, JSON.stringify(job.timeline, null, 2));

  job.status = "running";
  job.log = [...(job.log ?? []), "开始渲染，输出到 " + outputPath + "。"];
  writeJob(jobPath, job);
  log("开始渲染：", outputPath);

  const child = spawn(
    "npx",
    ["remotion", "render", "src/index.ts", "VerticalDraft", outputPath, "--props=" + propsPath],
    { stdio: ["inherit", "pipe", "pipe"], env: { ...process.env } },
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write("[render] " + text);
    job.log = [...job.log, text.trim()].slice(-200);
    writeJob(jobPath, job);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write("[render] " + text);
    job.log = [...job.log, text.trim()].slice(-200);
    writeJob(jobPath, job);
  });

  const finish = (status, error) => {
    job.status = status;
    job.outputPath = outputPath;
    if (error) {
      job.error = error;
      job.log = [...job.log, "失败：" + error].slice(-200);
    } else {
      job.log = [
        ...job.log,
        status === "done" ? "渲染完成。" : "任务已取消。",
        "输出位置：" + outputPath,
      ];
    }
    writeJob(jobPath, job);
    try {
      rmSync(propsPath, { force: true });
    } catch {
      // ignore cleanup errors
    }
  };

  const onSignal = (signal) => {
    log("收到 " + signal + "，正在取消渲染…");
    finish("cancelled");
    child.kill("SIGTERM");
    process.exit(130);
  };

  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  child.on("error", (error) => {
    finish("failed", error.message);
    log("渲染进程启动失败：", error.message);
    process.exit(1);
  });

  child.on("close", (code) => {
    if (code === 0) {
      finish("done");
      log("渲染完成：", outputPath);
    } else {
      const tail = stderr.trim().split("\n").slice(-4).join(" ");
      finish("failed", tail || "退出码 " + code);
      log("渲染失败，退出码：", code);
    }
  });
};

mkdirSync(join(process.cwd(), "out", "render-jobs"), { recursive: true });
main();
