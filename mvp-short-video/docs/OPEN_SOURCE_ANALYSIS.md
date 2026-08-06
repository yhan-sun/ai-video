# 开源项目参考与可行性判断

这个 MVP 没有复制第三方项目代码，而是借鉴了开源社区里更稳的产品路线：AI 负责策划和结构化时间线，确定性视频工具负责渲染。

## 参考方向

### short-video-maker

适合参考：文本生成短视频、TTS、字幕、背景视频、音乐、API/MCP、Remotion/FFmpeg 流水线。

不直接照搬原因：它更偏“文本生成视频”，我们的第一版更强调“商家授权素材 + 本地内容获客草稿”。

### Remotion

适合参考：用 React 写可参数化视频模板，把标题、字幕、素材、时间线作为 props 传入。

本项目采用方式：VerticalDraft 是一个 9:16 竖屏模板，读取 timeline JSON 后按场景顺序渲染。

注意事项：商业化时需要重新确认 Remotion 的商业许可边界，尤其是自动化视频生成和团队规模。

### OpenReelio

适合参考：Tauri + Rust + React + FFmpeg + SQLite 的桌面端架构。

本项目采用方式：暂时先用 Web MVP 跑通产品逻辑，后续可以迁移到 Tauri，把商家档案、素材库、渲染任务放到本地。

### Clipkit / JSON timeline 思路

适合参考：让 AI 输出结构化 JSON，而不是让 AI 直接写剪辑代码。

本项目采用方式：data/sample.timeline.json 是核心中间层。未来接 LLM 时，也只要求模型输出同一套 schema。

### Auto-Editor / PySceneDetect / WhisperX / MoviePy

适合参考：自动去静音、场景检测、字幕识别、程序化剪辑。

本项目暂未采用原因：第一版先验证商家是否愿意为“稳定内容草稿”付费，不先做复杂视频理解。

## 为什么第一版不做“全自动爆款”

爆款结果受账号权重、发布时间、互动、素材质量、平台分发和选题情绪共同影响，不能靠剪辑算法保证。

更可靠的承诺是：

> 导入商家资料和素材，10 分钟生成 10 条可审核、可修改、可渲染的短视频草稿。

## 第一版产品边界

已经完成：

- 商家资料输入
- 样例素材
- 10 条草稿生成
- 结构化 timeline JSON
- Web storyboard 预览
- HTML storyboard 导出
- Remotion 竖屏视频模板
- Remotion render/still 命令

刻意不做：

- 自动搬运平台视频
- 自动抓取公开视频
- 承诺自动爆款
- 无人工审核直接发布

## 下一步最值得做

1. 把 Web 操作台封装进 Tauri。
2. 用 SQLite 保存商家和历史草稿。
3. 接入 LLM，让模型输出同一套 timeline schema。
4. 加入 Whisper/FFmpeg，支持长视频切片和字幕。
5. 加入模板库：民宿、农产品、探店、路线攻略、培训招生。
