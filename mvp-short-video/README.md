# Local AI Short Video MVP

本地商家 AI 短视频草稿机：输入商家资料和客户授权素材，生成 10 条短视频草稿，并用 storyboard / Remotion 做预览与渲染。

第一版的核心承诺不是“自动制造爆款”，而是：

> 10 分钟生成 10 条可审核、可改文案、可换素材、可渲染的短视频草稿。

## 已完成能力

- 单一数据契约：Web、Node 脚本、导出同步、Remotion 共用同一套 Zod schema（`src/contract/schema.ts`，`schemaVersion: 2`），带迁移函数；旧版 v1 时间线与 v1-v3 工作区自动迁移，迁移失败有可见提示
- 项目引导：新建商家项目、导入/导出商家配置 JSON（Zod 校验）、维护名称、行业、区域、人群、卖点、痛点、证据点、优惠、CTA、话题标签和品牌风格
- 稳定 draftId：草稿编辑、锁定、历史版本、审核状态都按 `draftId` 绑定；重新生成后旧编辑自动清理
- 审核失效：任何影响输出的修改都会按 `approvedContentHash` 自动撤销原审核（记录批准时内容哈希，变更即置回 pending）
- 导出门禁：未通过 schema、素材、内容、证据或人工审核时默认阻止导出；远程 URL 素材默认禁止；needsHumanEvidence 草稿默认阻止导出
- 素材库：真实文件选择器批量导入（SHA-256 hash、图片尺寸、视频时长、缩略图、重复检测）、标签、授权来源/范围/日期/到期时间、缺失文件检测、相对路径管理；导入文件仅保存在本机（IndexedDB），导出不包含本机绝对路径
- 生成质量：确定性 seed、相似度指纹去重（10 条草稿在钩子/痛点/证据/CTA 上差异明显）、行业模板（民宿/餐饮/农产品/探店/培训/本地服务/美业/宠物/母婴亲子 9 类）、每模板 4 个钩子变体轮换、按区域注入方言称呼（街坊/老师/老铁/伙计/朋友等 7 区）、文案长度约束（标题 ≤34、画面大字 ≤32、正文 ≤200）
- LLM Provider（可替换）：OpenAI 兼容接口，只输出经共享 Zod schema 校验的 `DraftProposal`；记录 model、promptVersion、输入 hash、生成时间与有限次 schema repair；不生成剪辑代码，不虚构价格/优惠/销量/评价/距离/效果，证据不足标记 `needsHumanEvidence`；本地规则生成器作为离线 fallback
- 编辑体验：标题、正文、CTA、标签、分镜类型/文案/时长/顺序/素材直接编辑；字段锁定、撤销/重做（⌘Z/⇧⌘Z）、自动保存、版本历史与恢复、批量审核、AI 建议逐项应用
- 三栏工具界面：侧边栏 / 草稿列表 / 检查器；窄屏保留侧边栏与列表，检查器折叠为可关闭抽屉；键盘操作（⌘S 保存版本、⌘⏎ 审核、Esc 关闭、/ 聚焦搜索）、focus-visible、ARIA、破坏性操作确认
- 视觉统一：`src/contract/tokens.ts` 共享视觉 token，Web Storyboard 与 Remotion `VerticalDraft` 共用布局规则；VerticalDraft 支持图片/视频裁切（objectFit/objectPosition）、视频 trim、播放速度、原声/背景音量、字幕安全区、长文案字号自适应、素材损坏占位和克制转场
- 导出闭环：当前草稿 / 全部草稿 / 仅已审核草稿导出；导出包含 timeline + asset manifest + review metadata + schemaVersion + draft/unreviewed 状态；浏览器内生成 Storyboard（可见进度）；渲染任务记录（可见进度、日志、取消、错误原因、输出位置，配合 `scripts/render-job.mjs` 真实执行）
- 项目历史：保存/切换/删除商家项目快照（配置 + 规则 + 素材清单与标签/授权 + 桌面端全量草稿编辑/历史/素材元数据），桌面端存入本地 SQLite（`clips-studio.db`，rusqlite bundled + spawn_blocking 异步，自动迁移旧表加列），浏览器端存入 localStorage（配置级）；首次使用自动把旧数据迁移进数据库
- 本地持久化：浏览器 localStorage + IndexedDB 兼容 adapter；Tauri 桌面端统一走 SQLite（workspace / drafts / draft_versions / assets / asset_authorization / render_jobs / blobs / projects 表），迁移与保存失败均有可见反馈
- Tauri 桌面端：Rust 后端全部文件/数据库操作为异步（tokio + spawn_blocking）——原生多选文件对话框、SHA-256 哈希去重、复制进本机素材库目录、磁盘存在性校验、保存对话框落盘、Remotion 渲染任务（进度日志事件流、可取消、错误与输出位置回传）；前端桥接层全部 async，浏览器环境自动降级
- 无系统标题栏窗口：macOS 用 `titleBarStyle: Overlay` + `hiddenTitle`（去掉系统白色标题栏方框，保留原生红绿灯）+ `transparent`（`macOSPrivateApi`）透明窗口；其余平台运行时 `set_decorations(false)`；前端自绘全宽可拖拽 chrome 条（`data-tauri-drag-region`，非 macOS 提供最小化/最大化/关闭按钮与双击最大化），应用壳层圆角 + 阴影
- 差异对比与审校：新增"差异对比"视图——草稿 A/B/C 选择器（C 可关闭）、字段级分镜对比（画面大字/辅助文案/时长/素材，变化高亮并标注变化类型）、发布文案对比、时长/素材/审核状态摘要、"下一对"快速轮换、逐字段"B→A / C→A"合并回草稿 A、直接对 A 标记审核通过；审核清单每行可一键"对比"
- 测试与工程：契约 / 生成器确定性 / 去重 / 行业模板 / 长度约束 / 审核失效 / 证据门禁 / 远程素材门禁 / LLM 修复循环 / 导出包 / Storyboard / 差异对比 / 桌面桥接 / 组件 / 最小 Remotion 渲染 / Node smoke test（103 项）+ ESLint + Prettier + GitHub Actions CI

## 快速开始

安装依赖：

    npm install

启动 Web 操作台：

    npm run app

默认地址一般是：

    http://localhost:5173

生成单条时间线：

    npm run generate

生成 10 条草稿：

    npm run generate:batch

生成指定批次（可传 seed）：

    npm run generate:batch -- data/merchant.example.json data/campaigns 6 --template checklist,comparison --tone direct --min-duration 20 --max-duration 24

把 Web 操作台下载的 JSON 同步到 Remotion 默认数据文件（需要草稿已人工审核通过）：

    npm run sync:timeline -- ~/Downloads/timeline-01.json

批量同步全部草稿：

    npm run sync:timeline -- ~/Downloads/all-timelines.json

跳过审核门禁（确认风险后使用）：

    npm run sync:timeline -- ~/Downloads/timeline-01.json --force

导出 HTML storyboard：

    npm run storyboard

构建 Web 操作台：

    npm run build:app

类型检查：

    npm run typecheck

Lint / 格式化：

    npm run lint
    npm run format

测试（契约 + 单元 + 质量 + 组件 + 最小渲染 + smoke）：

    npm test

渲染任务（真实进度/日志/取消/错误，输出 MP4）：

    node scripts/render-job.mjs out/render-jobs/job-<id>.json

## 导出审核门禁

正式导出（下载 JSON、`sync:timeline`、创建渲染任务）默认要求草稿同时满足：

1. 通过共享 Zod schema（`schemaVersion` 与核心字段完整）
2. 素材、内容检查无阻断项
3. 全部素材为本机相对路径（远程 URL 默认禁止）
4. 无 `needsHumanEvidence` 证据缺口
5. 人工审核 `reviewState === "approved"` 且内容哈希未被修改

Web 操作台在检查器和导出页会显示具体被阻止原因；确认风险后可以强制导出。Node 同步脚本默认拒绝未审核草稿，`--force` 可覆盖。

## Remotion 预览与导出

打开 Remotion Studio：

    npm run dev

导出单帧预览：

    npm run still

导出 mp4：

    npm run render

注意：Remotion 第一次运行 still/render 会下载 Headless Chrome。如果下载卡住，可以安装 Chrome 后设置：

    export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    npm run still
    npm run render

## 数据入口

脚本模式修改：

    data/merchant.example.json

核心字段：

- name：商家名称
- industry：行业，如民宿、茶叶、咖啡、旅行社
- location：所在地
- audience：目标人群
- sellingPoints：卖点
- painPoints：客户痛点
- proofPoints：证据点
- offer：领取资料 / 优惠 / 咨询钩子
- cta：评论区引导
- brandStyle：品牌风格（可选）

输出文件：

- data/sample.timeline.json：单条草稿
- data/campaigns/*.timeline.json：批量草稿
- out/storyboard.html：HTML storyboard

## 时间线数据契约

Web、Node 脚本、导出同步和 Remotion 共用 `src/contract/schema.ts`（`SCHEMA_VERSION = 2`）：

- `TimelineSchema`：`schemaVersion`、`draftId`、`title`、`template`、`format`、`fps`、`width`、`height`、`merchant`、`musicHint`、`scenes`（含可选 `media`：objectFit/objectPosition/trimStart/trimEnd/playbackRate/volume/muted）、`publishCopy`、`reviewState`、`reviewMeta`、`sourceProposal`、`generationMeta`、`sourceConfig`、`sourceRules`
- `DraftProposalSchema`：LLM 唯一可输出的结构化草稿契约（含 `needsHumanEvidence`、`evidenceNotes`）
- `SceneSchema`、`MerchantConfigSchema`、`GenerationRulesSchema`（含 `seed`）、`AssetMetaSchema`（含 hash/尺寸/时长/授权扩展）、`ExportEnvelopeSchema`、`ExportPackageSchema`
- `src/contract/migration.ts`：`migrateTimeline` / `migrateWorkspaceRecord` 提供版本迁移，旧版 localStorage 与旧版 JSON 自动迁移，迁移失败有可见提示

升级 schema 时：新增字段用 `.optional()` 或 `.default()`，同时提升 `SCHEMA_VERSION` 并补迁移函数，不要删除核心字段。

## 素材放置

把客户授权素材放进：

    public/assets/

支持：

- 图片：jpg、jpeg、png、webp、svg
- 视频：mp4、mov、webm

Web 操作台素材库可批量导入本地文件（计算 hash/尺寸/时长/缩略图并去重）、校验文件是否存在、标记授权状态与授权来源/范围/日期/到期时间、补充标签，并把素材分配给指定分镜。默认禁止远程 URL 素材，导出不包含本机绝对路径。

## Tauri 桌面端

需要 Rust 工具链（cargo/rustc）与 Node.js：

    npm install
    npm run tauri:dev      # 开发模式（起 Vite + 桌面窗口）

构建可分发的 .app / .dmg：

    npm run tauri:build

桌面端与浏览器端的差异：

- 素材导入：原生多选文件对话框 → Rust 异步计算 SHA-256 去重 → 复制进本机素材库目录（应用数据目录 `assets/`）→ 前端异步读取尺寸/时长/缩略图。导出始终只含 `library/<hash>-<name>` 相对路径，本机绝对路径只存在运行时缓存，绝不写入导出包
- 文件校验：真实磁盘异步校验（素材库目录 + 项目 `public/` 目录），替代浏览器的 HTTP HEAD
- 导出：JSON / Storyboard / 导出包通过原生保存对话框落盘（异步）
- 渲染：任务在应用内启动 Remotion（`npx --no-install remotion render`），进度日志通过事件流实时显示、可取消、错误原因与输出位置（应用数据目录 `renders/<jobId>/vertical-draft.mp4`）回传界面
- 生产打包：`npm run tauri:build` 会先把渲染运行时（裁剪后的 node_modules + 源码，约 250MB）打进 .app，桌面端**开箱即用**——首次渲染自动生成 Remotion bundle 缓存到应用数据目录（资源目录只读，缓存写可写位置），无需项目目录与网络下载

## 媒体处理（FFmpeg / Whisper）

桌面端素材库内置媒体工具（检测本机 ffmpeg/ffprobe/whisper.cpp，缺失时给出安装提示）：

- **切片/转码**：按起点与时长从长视频截取片段（h264/aac + faststart），自动生成缩略图并注册为素材（`clips/<name>.mp4`，元数据带 `sourceClip`），全程进度日志、可取消
- **转写**：ffmpeg 提取 16k 单声道音频 → whisper.cpp 转写（模型如 `ggml-base.bin`，支持 `-tr` 翻译为英文，双语分段 `translatedSegments`）→ 生成 SRT 与分段字幕，写入素材元数据 `transcript`，素材卡片可预览前几行
- **口播稿与波形**：已转写素材一键生成"口播稿"——按分镜窗口聚合字幕为连贯旁白（每分镜一段 + 全文，可复制/导出 txt）；视频素材可加载音频波形（ffmpeg 4kHz 采样 → Rust 降采样 160 桶 → 前端 Canvas 绘制），辅助切片定位
- **字幕填入分镜**：已转写素材一键"自动填入当前草稿"——按分镜时间窗口自动切分字幕生成辅助文案，每句带 `subtitleSource` 来源标记（素材 + 绝对时间段），审核清单新增"文案来源"检查，人工改写字幕自动清除来源标记（防止来源与文案脱节），锁定分镜跳过
- **字幕时间轴编辑器**：素材库可展开"对齐字幕"面板——时间轴可视化（分镜轨道 + 字幕段色块，归属分镜颜色实时反映）、多素材叠加轨道（勾选对照其他素材的字幕位置）、波形时间轴对齐（与字幕同坐标系，辅助定位语音）、逐段指派归属分镜（自动/不填入/指定分镜）、按指派生成并填入草稿，未指派段落自动按窗口归属；字幕段支持点击选中（Shift 多选）、直接拖拽（整组拖入目标分镜）、键盘指派（Enter/空格）；指派结果可保存到素材元数据跨会话保留，也可随填入草稿一并保存
- 安装：`brew install ffmpeg whisper-cpp`；模型从 huggingface（国内可用 hf-mirror）下载，如 `ggml-tiny.bin` / `ggml-base.bin`

无桌面端时使用 CLI（与桌面端同参数语义）：

    node scripts/media-tool.mjs probe <video>
    node scripts/media-tool.mjs slice <video> <起点秒> <时长秒> -o out/clip.mp4 --thumb out/thumb.jpg
    node scripts/media-tool.mjs transcribe <video-or-audio> -o out/subtitles.srt --model /path/to/ggml-base.bin

## 模型接入

在“生成规则”页配置 OpenAI 兼容接口（baseUrl + apiKey + model），然后在“AI剪辑”页：

- “用模型优化当前草稿”：模型输出 DraftProposal → 校验 → 应用到当前草稿
- “生成全部草稿（模型或本地规则）”：未配置时自动退回本地规则生成器

模型调用记录（provider、model、promptVersion、inputHash、generatedAt、repairCount、needsHumanEvidence）会写入 `generationMeta` 并随导出包输出。

## 项目结构

    index.html                          Web 操作台入口
    src/contract/schema.ts              单一 Zod 数据契约（Web/Node/Remotion 共用）
    src/contract/migration.ts           数据迁移与兼容函数
    src/contract/tokens.ts              共享视觉 token（Storyboard 与 Remotion 共用）
    src/app/App.tsx                     界面组合（三栏布局 + 抽屉检查器 + 键盘操作）
    src/app/types.ts                    领域类型与常量
    src/app/format.ts                   纯工具函数
    src/app/timeline.ts                 草稿生成逻辑（seed + 去重 + 行业模板 + 长度约束）
    src/app/analysis.ts                 审核分析、编辑应用、审核失效
    src/app/assets.ts                   素材校验、标签、匹配
    src/app/importAssets.ts             本地文件导入（hash/尺寸/时长/缩略图/去重）
    src/app/llm.ts                      LLM provider（DraftProposal 校验、repair、trace）
    src/app/ai.ts                       AI 剪辑方案（本地规则，不接外部抓取）
    src/app/export.ts                   导出 payload、导出包与导出门禁
    src/app/project.ts                  项目引导与商家配置导入/导出
    src/app/storyboardHtml.ts           浏览器端 Storyboard 生成（共享 tokens）
    src/app/state/workspace.ts          localStorage 持久化与迁移
    src/app/state/storage.ts            IndexedDB / SQLite 兼容 adapter（含 blob 存储）
    src/app/state/useWorkspace.ts       状态层 hook（草稿/编辑/历史/审核/LLM/渲染任务/项目）
    src/app/projectStore.ts             项目快照构建与浏览器端项目存储
    src/app/desktop.ts                  Tauri 桌面桥接层（全部 async，浏览器自动降级）
    src/app/components/                 侧边栏、草稿列表、检查器、素材库等 UI 组件
    src/app/app.css                     Apple HIG-like 工具应用视觉系统
    src/VerticalDraft.tsx               Remotion 竖屏视频模板（裁切/trim/音量/安全区/占位）
    src/campaign.ts                     Remotion 侧契约再导出
    src-tauri/                          Tauri 桌面端（Cargo + tokio 异步文件/渲染命令）
    scripts/timeline-core.mjs           Node 侧生成核心（复用 src 契约）
    scripts/generate-campaign.mjs       生成单条 timeline
    scripts/generate-batch.mjs          生成批量 timeline
    scripts/sync-workbench-export.mjs   同步 Web 下载 JSON（含审核与证据门禁、迁移）
    scripts/render-job.mjs              渲染任务执行器（进度/日志/取消/错误/输出位置）
    scripts/media-tool.mjs              媒体工具 CLI（probe/slice/transcribe，同桌面端语义）
    scripts/workbench-smoke-test.mjs    覆盖生成、审核门禁和同步链路的 smoke test
    scripts/export-storyboard.mjs       导出 HTML storyboard
    tests/                              契约 / 单元 / 质量 / 组件 / 最小渲染测试
    data/merchant.example.json          商家输入样例
    public/assets/                      客户授权素材
    .github/workflows/ci.yml            类型检查 + Lint + 格式化 + 构建 + 测试
    docs/OPEN_SOURCE_ANALYSIS.md        开源参考与可行性判断

## 商业化边界

不要宣传成“自动爆款工具”。更稳的定位是：

> 面向本地商家的 AI 内容草稿工作台。

也不要做公开视频抓取、搬运、自动发布。第一版服务“客户授权素材 + 人工审核 + 批量草稿 + JSON 导出 + Remotion 渲染”的闭环。

## 下一步

1. 差异对比增强：三份以上草稿并列对比与合并。
2. 多语言字幕（Whisper 翻译）自动生成双语 SRT 与字幕渲染。
3. 生产打包的运行时体积优化（按需裁剪更细粒度）。
