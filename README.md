# dsh-plugins

我自己的 DeepSeek Harness 本地插件集合。一个仓库管所有本地插件，用 git 在多台电脑间同步。

这些插件**不修改 DSH 任何官方文件**，升级 DSH 不会与它们冲突。

## 仓库结构

```
dsh-plugins/
├── code-typer/            # 右侧栏「代码键入」面板：实时显示 agent 正在写的代码
├── llm-retry-settings/    # 设置界面「重试」分区：GUI 里调各提供方的重试策略
├── tools/
│   └── install.ps1        # 幂等安装脚本，支持单装或全装
├── .gitignore
└── README.md
```

每个子目录是一个独立的插件包（根目录即包，`package.json` + `index.js` 宿主半边 + `client.js` 浏览器半边 + 自带的 `cordis.patch.yml`），可以单独开发、单独发布。

## 安装

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1
```

默认安装全部插件；`-Plugin <目录名>` 只装一个：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1 -Plugin llm-retry-settings
```

脚本对每个插件做这些事，全部幂等可重复执行：

1. 在 `profiles/<profile>/node_modules/@local/<名>` 建 Junction 指向插件目录
2. 在 profile 的 `package.json` 登记 `link:` 依赖，并加入 `dsh.profile.bundles`
3. 挂载由插件**自带**的 `cordis.patch.yml` 通过 bundle 层完成（自包含形态，与官方插件一致）；插件没有自己的 patch 时，才退回往 profile 的 `cordis.patch.yml` 追加 insert 条目
4. 自带校验：链接可解析、依赖已登记、无重复挂载；JSON 先校验后落盘，写坏会自动中止

profile 名不是 `desktop` 时脚本自动探测。脚本只写 `~/.dsh/profiles/<profile>/`，不碰 DSH 安装目录。跑完重启 DSH。

## 两种安装模式

| 模式 | 命令 | Junction 指向 | 更新方式 |
|---|---|---|---|
| copy（默认） | `tools\install.ps1` | `~/.dsh/local-plugins/<插件>` | `git pull` 后**重跑脚本** |
| in-place | `tools\install.ps1 -InPlace` | 这个 clone 里的工作副本 | `git pull` 即生效 |

copy 模式更稳（删掉 clone 不影响 DSH）；in-place 适合频繁迭代。改 `client.js` 只需刷新浏览器页面，改 `index.js` / `package.json` 需要重启 DSH。

## 多台电脑同步

```powershell
# 每台电脑第一次
git clone <仓库地址> dsh-plugins
cd dsh-plugins
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1

# 之后
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1    # copy 模式才需要
```

## 新增一个插件

1. 在仓库根新建目录，放入 `package.json`（`name` 必须是 `@local/xxx` 这种带作用域的名字）、`index.js`、`client.js`、`cordis.patch.yml`
2. 跑 `tools\install.ps1 -Plugin <目录名>`
3. 重启 DSH

`package.json` 里声明客户端半边的最小形态：

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

删掉 `~/.dsh/local-plugins/<插件>`（copy 模式）、`node_modules/@local/<插件>`，以及 `package.json` 里的依赖与 bundles 两处。

## 各插件文档

- [code-typer](code-typer/README.md)
- [llm-retry-settings](llm-retry-settings/README.md)
