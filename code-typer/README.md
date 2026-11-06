# code-typer

DSH 插件：Agent 写入代码时，在**右侧栏**自动打开一个电影黑客风格的终端面板，以打字机效果显示模型**正在生成**的代码。

## 效果

- 右侧栏面板（tab 类型 `code-typer`），随 Agent 开始写代码自动拉开
- 终端外观：交通灯标题栏、深色屏幕、绿色等宽字体、扫描线、闪烁块光标
- 代码随模型流式生成**逐字增长**——增长本身就是打字效果，不是生成完才播放
- 标题栏显示 `代码键入 — <文件名>` 与状态（键入中 / 已完成）
- 尊重 `prefers-reduced-motion`

## 覆盖范围

- 工具：`write`、`edit`、`apply_patch`（bash、read 等不触发）
- **排除文档类文件**：`.md`、`.markdown`、`.mdx`、`.txt`、`.rst`、`.adoc`、`.org`、`.textile`
  ——这是代码窗口，不是文档预览器；读 markdown 请用侧边栏文档预览（该面板只读，
  DSH 目前没有内联 md 编辑）
- `apply_patch` 无 `file_path` 时从 `*** Update File:` 头部推断路径

## 架构

实时性来自模型流，而不是提交后的事件：

- **Host**（[index.js](index.js)）监听进程内 `agent/assistant-stream`，在模型生成过程中累积
  `tool-call-delta` 的原始 JSON 参数，用容错扫描器增量解析 `content` / `new_string` / `input`
  （截断的 JSON 也能读出已到达的前缀）。结果由 loopback 路由 `/code-typer/live` 提供；
  不带 `session` 参数时返回最近更新的草稿。同时保留一个会话投影作为语义回退。
- **Client**（[client.js](client.js)）向 `sidebar.right.pane.tab` 注册面板体，向
  `sidebarRightTabs` 注册 tab 类型 `code-typer`；每 130ms 轮询一次端点并直接渲染增长中的代码。
  另有一个无渲染的 watcher 挂在输入框 dock，检测到 `typing` 时调用 `sidebarRight.openTab()`，
  并做 2.5 秒节流以尊重用户手动关闭。

## 实时链路要点

- 参数按 `callId` 累积；工具名只在首个 delta 出现
- 等目标路径出现后才开始显示（避免未知文件的草稿闪烁）
- 最后一次增量后 1.2 秒无更新 → `typing` 变 `settled`
- 路由要求 `Sec-Fetch-Site: same-origin`，监听器仅在 loopback
- 单条草稿上限 48000 字符

## 安装与更新

```powershell
plugin_manager action=install_bundle target=E:\Documents\deepseek-harness\default-workspace\code-typer
```

已安装为目录链接。**替换已装包需要重启 DSH** 才会加载新的 Host/Client 模块代。

## 自定义

- 增减工具：`index.js` 的 `CODE_TOOLS`
- 增减排除的文档扩展名：`index.js` 的 `DOC_EXTENSIONS`
- 轮询间隔 / 自动打开节流：`client.js` 的 `POLL_MS`、`AUTO_OPEN_GAP_MS`
- 配色：`client.js` 的 `CSS` 中 `--ct-*` 变量

## 故障排查

- **面板不弹**：确认插件已启用；刷新页面后仍需重启才能生效（Client 模块只在页面加载时进入引导图）
- **面板不更新**：投影只折叠已提交事件，实时数据来自流；若一直"等待"，说明没有捕获到流（检查源文件是否已随重启加载）
- **手动关闭后不再弹**：2.5 秒节流内不重开，下次写入会重新拉开
