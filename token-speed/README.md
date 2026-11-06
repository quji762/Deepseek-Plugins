# token-speed

DSH 插件：在**右侧栏**显示当前会话每一步模型生成的**实时 Token 速度曲线**。

## 效果

- 右侧栏面板（tab 类型 `@local/token-speed`），标题「Token 速度」
- 顶部大字显示**当前速度**（tok/s）：生成中为实时值，空闲时显示最近一步的速度
- 状态徽章：生成中显示脉冲圆点与已耗时（如「生成中 3.2s」），空闲显示「空闲」
- 统计行：**平均** / **峰值** / **累计 tokens**
- 曲线图：每一步生成一个点，单调三次插值平滑，纵轴 tok/s，横轴最近 3 分钟滑动窗口
- 生成过程中有一条**虚线实时段**从最后一个点延伸到当前速度，曲线头部随生成移动，不用等整步提交
- 悬停任意点显示提示：第几轮第几步、速度、tokens 数、解码耗时，中断的步另有标记
- 配色全部走 `--dsw-alias-*` 主题变量，文案走 `tokenSpeed` 语言命名空间（中/英）

## 数据链路

速度按「步」结算，两条路径喂同一张图：

- **持久路径**——Host 侧（[index.js](index.js)）的 `tokenSpeed` 会话投影：`step/start` 开步，
  `assistant/message` 用该次尝试的紧凑流（token delta 自带逐片时间戳）结算出首 token 时间与
  token 数，结合提供方 usage 得到本步速度。窗口保留最近 48 步，fork/resume/回放后数据仍在。
- **实时路径**——Client 侧（[client.js](client.js)）订阅 Session 事件流的 `assistant/live-chunk`
  瞬态帧，折叠出正在生成那一步的即时 token 数与速度，即曲线上的虚线延伸段。

Host 从不折叠实时数据，Client 从不折叠持久事件；浏览器时钟按每个视图把投影回报的
`serverTime` 锚定一次，再自行外推。

## 读数约定

- 解码窗口截至 `assistant/message` 事件时刻（与内置 `sessionStats` 同一约定），不是最后一个 delta
- token 数优先取提供方 usage 的 `outputTokens`，缺失时退回按流内 delta 计数
- `decodeMs` 至少计 1ms，避免除零；速度为四舍五入的整数 tok/s

## 安装与更新

```powershell
dsh plugin --profile desktop add "https://github.com/quji762/Deepseek-Plugins#path:token-speed"
```

本机当前是本地绝对路径安装（`link:` 依赖），改完仓库后 `remove` 再 `add` 即可拿到新 commit。
改 `client.js` 只需刷新浏览器页面；改 `index.js` / `package.json` 需要重启 DSH。

## 自定义

- 窗口步数：`index.js` 的 `WINDOW_STEPS`（48）
- 可见时间窗 / 最小跨度：`client.js` 的 `WINDOW_MS`（3 分钟）、`MIN_SPAN_MS`
- 实时态重渲染节拍：`client.js` 的 500ms `setInterval`
- 文案：`client.js` 的 `zh` / `en` 字典（改后同步 `locale/*.json` 的 meta）

## 故障排查

- **面板没有数据**：确认会话里有已完成的生成步；投影只折叠持久事件，全新会话第一条消息发出后才有点
- **曲线不动**：实时段来自 `assistant/live-chunk` 瞬态帧，仅在生成期间出现；若徽章显示「空闲」而模型仍在输出，检查 DSH 版本是否发布该事件
- **时间轴看起来滞后**：浏览器时钟按视图锚定一次后外推，长时间挂机后切换会话即重新锚定
