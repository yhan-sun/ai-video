# Project Direction for AI Agents

## 你要做什么

这个项目要做的是：**本地商家 AI 短视频草稿工作台**。

它不是“自动爆款神器”，也不是通用视频剪辑软件。核心任务是帮助本地商家把已授权素材、商家信息、卖点、痛点和 CTA，快速整理成一批可以人工审核、修改、导出和渲染的短视频草稿。

第一版目标必须非常清楚：

> 10 分钟生成 10 条可审核、可改文案、可换素材、可导出 JSON、可用 Remotion 渲染的 9:16 短视频草稿。

## 用户真正想要的东西

用户要的是一个能真实跑起来的 MVP，不是概念稿。

优先级从高到低：

1. 能导入或配置商家资料、卖点、痛点、证据点、CTA、话题标签和客户授权素材。
2. 能自动生成多条短视频草稿，每条草稿包含标题、发布文案、场景结构、素材匹配、时长和导出数据。
3. 能用清楚的界面审核草稿：左侧侧边栏、中间草稿列表、右侧检查器。
4. 能导出 timeline JSON，并能通过 storyboard / Remotion 做预览和渲染。
5. 后续再考虑 Tauri 桌面端、本地文件选择器、SQLite、LLM 接入、FFmpeg/Whisper。

## 当前产品定位

一句话：

> 给本地商家用的 AI 内容草稿机：从素材和卖点生成可审核的短视频脚本与视频时间线。

更具体地说：

- 目标用户：民宿、餐饮、农产品、探店、培训、本地服务商家。
- 输入：客户授权素材 + 商家资料 + 卖点/痛点/证据/优惠/CTA。
- 输出：10 条候选短视频草稿 + timeline JSON + storyboard + Remotion 渲染入口。
- 价值：降低从“素材一堆、不知道发什么”到“有 10 条可选视频方向”的时间成本。

## 不要做什么

不要把产品说成或做成：

- “自动生成爆款视频”
- “公开视频搬运工具”
- “自动发布工具”
- “抖音/小红书无脑矩阵号工具”
- “炫酷但没用的营销 Dashboard”
- “复杂的视频剪辑专业软件”

第一版必须坚持：**客户授权素材、本地优先、人工审核、草稿生成、可导出渲染**。

## UI/UX 方向

用户已经明确嫌弃前几版“太丑”“太网页感”。

当前设计方向应参考 Apple Human Interface Guidelines 的桌面工具应用感觉：

- 保留清晰侧边栏，不要隐藏成纯图标。
- 使用三段式信息架构：侧边栏 / 草稿列表 / 检查器。
- 视觉要克制、干净、原生、实用。
- 避免大渐变、玻璃拟态、营销卡片、夸张阴影。
- 首屏只放最重要工作流，不要把配置大表单、runbook、验证面板全部堆出来。
- 小屏时优先保住侧边栏和草稿列表，右侧检查器可以折叠或隐藏。

如果继续改 UI，先保证：

1. 侧边栏存在且可读。
2. 草稿列表不重叠、不糊、不像表格挤爆。
3. 检查器不抢主流程。
4. 按钮少而明确。
5. 页面像工具，不像宣传页。

## 技术栈

当前 MVP 使用：

- React
- TypeScript
- Vite
- Remotion
- Node.js 脚本
- 本地 JSON 数据
- 静态素材目录 `public/assets/`

重要目录：

- `mvp-short-video/src/app/`：Web 操作台
- `mvp-short-video/src/app/App.tsx`：主界面与交互
- `mvp-short-video/src/app/app.css`：主 UI 样式
- `mvp-short-video/src/VerticalDraft.tsx`：Remotion 竖屏视频模板
- `mvp-short-video/src/app/timeline.ts`：前端草稿生成逻辑
- `mvp-short-video/scripts/timeline-core.mjs`：Node 侧时间线生成核心
- `mvp-short-video/data/merchant.example.json`：商家输入样例
- `mvp-short-video/public/assets/`：客户授权素材

## 开发命令

在 `/Users/pyu/code/chu/mvp-short-video` 下运行：

```bash
npm run app
npm run typecheck
npm run build:app
npm run generate
npm run generate:batch
npm run storyboard
npm run dev
npm run render
```

每次改代码后，至少运行：

```bash
npm run typecheck
npm run build:app
```

## 后续最重要的实现顺序

如果用户说“继续”“完善”“开始吧”，不要重新解释商业模式，直接继续做：

1. 修 UI：Apple 原生工具应用质感，先解决丑、乱、挤、重叠。
2. 做真实素材导入体验：从手填路径升级到本地文件选择器，未来可用 Tauri。
3. 做草稿编辑：标题、正文、场景文案、CTA 可以直接改。
4. 做导出闭环：当前草稿 JSON、全部草稿 JSON、storyboard、Remotion render。
5. 做本地持久化：SQLite 或 localStorage，保存商家和草稿历史。
6. 接 LLM：让模型输出同一套 timeline schema，不要破坏现有 JSON 结构。

## 判断完成的标准

一个改动只有满足这些条件才算完成：

- 页面能启动。
- TypeScript 检查通过。
- Web 构建通过。
- 首屏没有明显重叠、错位、糊成一团。
- 产品仍然围绕“本地商家短视频草稿”。
- 没有引入公开视频抓取、自动搬运、自动发布等偏离方向的能力。

## 对用户沟通

用户想要执行，不想听空话。

回复要直接：

- 先说做了什么。
- 再说在哪里看。
- 再说还差什么。
- 不要长篇解释。

如果 UI 被用户说丑，不要辩解，直接改结构、密度、层级和布局。
