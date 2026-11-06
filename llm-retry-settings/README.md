# @local/llm-retry-settings

给 DSH 设置界面加一个「重试」分区，用来在 GUI 里调整每个模型提供方的重试策略，不必再手改 `cordis.patch.yml`。

## 它解决什么

DSH 的模型重试策略（`retryPolicy`）属于各提供方适配器的配置，「设置 → 模型」卡片只暴露 API 密钥、baseURL、模型目录等精选字段，重试参数官方明确留在 `cordis.patch.yml` 中。本插件把这份配置搬进设置界面：

- **设置 → 重试**（位于「模型」之后）为每条 `llm-pi-ai` 提供方路由渲染一张卡片
- 可编辑：模式（有界 / 不限次数）、重试次数、首次间隔、最长间隔、抖动比例
- 「恢复默认」一键移除该路由的覆盖，回到适配器默认策略
- 保存走宿主设置文档的同一条通道：完整 Config 校验 → 原子写入 profile patch → HMR 重载，非法值会被拒绝而不是写坏文件
- 卡片只在宿主服务 `llm-pi-ai` 命名空间时出现（`configForms.whileServed`）；有更高层级配置覆盖时自动转为只读

策略语义与 `@deepseek-ai/dsh-llm` 的 `retry-policy.js` 一致：延迟 = `min(首次间隔 × 2^(n−1), 最长间隔) × (1 − 抖动 + 2×抖动×random())`；首次与最长间隔相同且抖动为 0 即固定间隔。默认只重试限流、服务端错误、超时、传输错误与空响应。

## 安装（本机已配置）

本机通过安装脚本完成登记，插件包本身零依赖（`react` 由浏览器模块加载器提供）。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install-llm-retry-settings.ps1
```

脚本做四件事，全部幂等，可重复运行：

1. 把插件复制到 `~/.dsh/local-plugins/llm-retry-settings`（先清空再复制，不会留旧文件）
2. 在 `profiles/<profile>/node_modules/@local/` 建 Junction 指向该副本
3. 在 profile 的 `package.json` 登记 `link:` 依赖，并加入 `dsh.profile.bundles`
4. 若 profile 没有 bundles 列表可扩展，则退回往 `cordis.patch.yml` 追加 insert 条目

挂载由插件自带的 `cordis.patch.yml` 通过 bundle 层完成——和任何其他插件一样的自包含形态。DSH 首次识别到新依赖时会自动把它加进 bundles；脚本显式做这件事，避免依赖那一步。

**换一台自己的电脑**：把 `llm-retry-settings/` 文件夹和 `install-llm-retry-settings.ps1` 一起拷贝过去（保持两者在同一父目录），跑一遍脚本，重启 DSH。profile 名不是 `desktop` 时脚本会自动探测。

**更新**：替换源文件夹后重跑脚本；副本是 Junction 的目标，内容原地更新。改 `client.js` 只需刷新浏览器页面，改 `index.js`/`package.json` 需重启 DSH。

**卸载**：删掉 `~/.dsh/local-plugins/llm-retry-settings`、`node_modules/@local/llm-retry-settings`、`package.json` 里的依赖与 bundles 两处即可；`cordis.patch.yml` 无需改动。

## 结构

| 文件 | 职责 |
|---|---|
| `index.js` | 宿主半边（无操作）；挂载条目是客户端模块可被发现的前提 |
| `client.js` | 浏览器半边：注册 `settings.section` slot、读写设置文档 |
| `cordis.patch.yml` | 以 bundle 形式自带的 insert 补丁（本机改用 profile 补丁挂载，保留备选） |

## 维护备注

- 只覆盖 `llm-pi-ai`（pi-ai 多提供方适配器）。若要支持 DeepSeek 官方路由，需另加一张编辑 `llm-deepseek` 命名空间、路径为 `['retryPolicy']` 的卡片——`retryPolicy` 在该适配器位于路由顶层而非 `providers` 下。
- 保存值以 profile 用户层的现有 `retryPolicy` 为基底展开：宿主的 `set` 路径操作是**整体替换**该对象，不合并的话会抹掉手写的 `retryableCodes` 等字段。
- 写入走 `ctx.configForms.get(ns).mutate(ops)`，不要直接调 `ctx.remote.settings.mutate`：前者自带写入队列、修订号跟踪、镜像回折与失败重载，直连会在连续保存时撞过期修订号。
- 校验失败时保存按钮是禁用的，因此原因必须内联显示（`problem = error ?? invalid`），否则用户看不到为什么不能保存。
- 本地改动后刷新浏览器页面即可（客户端插件不走 DSH 自身的 HMR 开发链路）。

## 测试

- `../unit-test-helpers.js`——纯函数单测（校验规则、策略构建、草稿回填），25 例
- `../smoke-test-plugin.js`——带桩 React 与宿主服务的集成冒烟测试（注册、渲染、写入、冲突、只读、加载态）

两个脚本都用 DSH 自带的 Node 运行，例如：

```
"D:\Software\DSH\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" unit-test-helpers.js
```
