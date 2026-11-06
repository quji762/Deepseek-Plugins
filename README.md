# dsh-plugins

我自己的 DeepSeek Harness 插件集合。一个仓库管所有插件，用 git 在多台电脑间同步。

这些插件**不修改 DSH 任何官方文件**，升级 DSH 不会与它们冲突。

## 收录的插件

| 插件 | 作用 | 依赖 |
|---|---|---|
| [`token-speed`](token-speed/README.md) | 右侧栏「Token 速度」面板，实时绘制每一步模型生成的速度曲线 | 需宿主注册 HTTP 路由 |
| [`code-typer`](code-typer/README.md) | 右侧栏「代码键入」面板，实时显示 agent 正在写入的代码 | 需宿主注册 HTTP 路由 |
| [`llm-retry-settings`](llm-retry-settings/README.md) | 设置界面「重试」分区，GUI 里调各提供方的重试策略 | 只覆盖 pi-ai 路由 |

## 安装

三种方式，按推荐顺序。**任选一种，不要混用**（混用会让 Junction 和 pnpm 的 `node_modules` 路径冲突）。

### 1. 插件索引 / 发现页（最省事）

仓库带了一份 [market-index.json](market-index.json)（DSH 插件市场索引格式 1）。在 **设置 → 插件 → 发现** 标签页添加这个地址：

```
https://raw.githubusercontent.com/quji762/Deepseek-Plugins/main/market-index.json
```

添加后列出两张卡片，点一下即完成全部登记（写依赖、加 bundles、pnpm 硬链接、HMR 重载）。前提是 DSH 里开启了「自定义插件索引」这个实验性开关。

私有仓库的话 `raw.githubusercontent.com` 需要认证，此路不通，用下面的方式。

### 2. `dsh plugin add` 带 `#path:`

```powershell
dsh plugin --profile desktop add "https://github.com/quji762/Deepseek-Plugins#path:token-speed"
dsh plugin --profile desktop add "https://github.com/quji762/Deepseek-Plugins#path:llm-retry-settings"
dsh plugin --profile desktop add "https://github.com/quji762/Deepseek-Plugins#path:code-typer"
```

支持的 spec 形式：registry 包名、绝对本地路径、git 地址（`https://`、`git+https://`、`git+ssh://`、`github:user/repo` 简写）、tarball。私有仓库走系统 git 凭据助手（DSH 启动 pnpm 前会用 `git ls-remote` 探活，超时 5 秒）。

### 3. 本地绝对路径（开发中的插件）

```powershell
dsh plugin --profile desktop add "E:\Documents\deepseek-harness\default-workspace\dsh-plugins\llm-retry-settings"
```

改代码后重启 DSH 即可生效，适合边改边试。

## 要点

这几条都是实际踩过的坑，按重要性排：

**1. `#path:` 不能省略。** 这是 monorepo，仓库根没有 `package.json`。安装框里只填仓库地址会报「这个包没有声明组合包，不能作为插件管理」——pnpm 把仓库根当成一个无清单的包装了进来。必须写成 `...#path:<子目录>`。

**2. git 依赖被锁文件钉在具体 commit 上。** 推了新代码后，别的机器要 `remove` 再 `add` 才能拿到更新（spec 已安装时会被 `already-installed` 拒绝）：

```powershell
dsh plugin --profile desktop remove @local/llm-retry-settings
dsh plugin --profile desktop add "https://github.com/quji762/Deepseek-Plugins#path:llm-retry-settings"
```

**3. 改完插件要同步索引里的 commit。** 索引校验器**不核对**索引写的 `commit` 是否与包内容一致（这是它文档写明的限制）。漏了同步，发现页装到的就是旧 commit。索引在 [market-index.json](market-index.json)，两个插件各有一个 `source.commit`。

**4. `llm-retry-settings` 只覆盖 pi-ai 路由。** 它编辑 `llm-pi-ai` 的 `providers.<路由>.retryPolicy`；DeepSeek 官方路线（`dsh-llm-deepseek-api-key`）的 `retryPolicy` 在路由顶层而非 `providers` 下，需要另加一张卡片。只用官方路线的话，「重试」分区会显示"尚未配置任何提供方路由"。

**5. 推送时跟着代理状态走。** git 全局配了 `http.proxy` 时代理软件没开会直接失败，用 `-c http.proxy= -c https.proxy=` 绕过；代理开了则直连可能被阻断，用默认配置。本仓库两种都遇到过。

## 更新

```powershell
git pull                       # 在其他机器上
dsh plugin --profile desktop remove @local/<插件名>
dsh plugin --profile desktop add "<仓库地址>#path:<目录名>"
```

改 `client.js` 只需刷新浏览器页面；改 `index.js` / `package.json` 需要重启 DSH。

## 新增一个插件

1. 仓库根新建目录，放入 `package.json`、`index.js`、`client.js`、`cordis.patch.yml`
2. `git commit && git push`
3. 在 [market-index.json](market-index.json) 的 `plugins` 数组加一条（`name`、`source.path`、`source.commit` 都要有）
4. 用 DSH 自带的校验器验证后再推一次

`package.json` 的最小形态：

```json
{
  "name": "@local/my-plugin",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js", "./package.json": "./package.json" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-api-remotes"]
    }
  }
}
```

宿主半边可以是空操作（`export function apply() {}`）——挂载条目本身就是客户端模块能被发现的前提。

## 卸载

```powershell
dsh plugin --profile desktop remove @local/code-typer
```

同时移除依赖、取消 bundles 勾选、卸载模块。

## 排障

装完不确定是否生效，跑一遍：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File verify-plugins.ps1
```

逐项检查：依赖是否登记、bundle 是否列出、`client.js` 能否解析、锁文件是否记录。它会告诉你缺哪一项，以及对应的修复命令。

## 目录结构

```
dsh-plugins/
├── token-speed/             # 右侧栏「Token 速度」面板
├── code-typer/             # 右侧栏「代码键入」面板
├── llm-retry-settings/     # 设置界面「重试」分区
├── market-index.json       # 插件市场索引（发现页数据源）
├── verify-plugins.ps1      # 安装状态校验
├── .gitattributes          # 统一 LF，*.ps1 保持 CRLF
└── README.md
```

每个子目录是独立的插件包：`package.json` + `index.js`（宿主半边）+ `client.js`（浏览器半边）+ 自带的 `cordis.patch.yml`（负责挂载条目）。

## 各插件文档

- [token-speed](token-speed/README.md)
- [code-typer](code-typer/README.md)
- [llm-retry-settings](llm-retry-settings/README.md)
