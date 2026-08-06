#!/usr/bin/env node
// 生成 Tauri 桌面端运行时目录（src-tauri/resources/runtime）：
// 只复制 Remotion 渲染所需的生产依赖树 + 源码，供 .app 开箱即用地在后台渲染视频。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = path.join(root, "src-tauri", "resources", "runtime");

const TOP_LEVEL = [
  "remotion",
  "@remotion/cli",
  "@remotion/media",
  "@remotion/renderer",
  "@remotion/bundler",
  "react",
  "react-dom",
  "zod",
];

const collectDependencyTree = () => {
  const seen = new Set(TOP_LEVEL);
  const queue = [...TOP_LEVEL];

  while (queue.length > 0) {
    const name = queue.shift();
    const packagePath = path.join(root, "node_modules", name, "package.json");
    if (!fs.existsSync(packagePath)) {
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const deps = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    };
    Object.keys(deps).forEach((dep) => {
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    });
  }

  return Array.from(seen).sort();
};

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (source) => {
      const relative = path.relative(src, source);
      if (relative === ".cache" || relative.startsWith(".cache" + path.sep)) {
        return false;
      }
      if (source.includes("node_modules" + path.sep + ".cache")) {
        return false;
      }
      // 运行时不需要 source map（省 ~23MB）。
      if (relative.endsWith(".map")) {
        return false;
      }
      // prettier 仅 CLI 代码格式化用到，语言插件非渲染必需（省 ~8MB）。
      if (source.includes(path.join("node_modules", "prettier", "plugins"))) {
        return false;
      }
      return true;
    },
  });
};

const main = () => {
  const packages = collectDependencyTree();
  console.log("收集生产依赖：", packages.length, "个包");

  if (fs.existsSync(runtimeDir)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(runtimeDir, { recursive: true });

  copyDir(path.join(root, "src"), path.join(runtimeDir, "src"));
  copyDir(path.join(root, "public"), path.join(runtimeDir, "public"));
  fs.copyFileSync(path.join(root, "package.json"), path.join(runtimeDir, "package.json"));

  const nodeModulesDest = path.join(runtimeDir, "node_modules");
  fs.mkdirSync(nodeModulesDest, { recursive: true });

  for (const name of packages) {
    const source = path.join(root, "node_modules", name);
    if (fs.existsSync(source)) {
      copyDir(source, path.join(nodeModulesDest, name));
    }
  }

  // .bin 可执行文件（remotion CLI shim）。
  const binSource = path.join(root, "node_modules", ".bin");
  if (fs.existsSync(binSource)) {
    copyDir(binSource, path.join(nodeModulesDest, ".bin"));
  }

  const size = fs.statSync(runtimeDir).size / 1024 / 1024;
  console.log("运行时目录：", runtimeDir, "（" + size.toFixed(1) + " MB）");
};

main();
