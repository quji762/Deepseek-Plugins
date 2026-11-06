# dsh-plugins

我自己的 DeepSeek Harness 本地插件集合。一个仓库管所有本地插件，用 git 在多台电脑间同步。

这些插件**不修改 DSH 任何官方文件**，升级 DSH 不会与它们冲突。

## 仓库结构

```
dsh-plugins/
├── code-typer/            # 右侧栏「代码键入」面板：实时显示 agent 正在写的代码
├── llm-retry-settings/    # 设置界面「重试」分区：GUI 里调各提供方的重试策略
├── tools/
│   └── install.ps1        # 备用安装脚本（离线 / 本地路径场景）
├── .gitattributes         # 统一 LF，避免多机换行符抖动
└── README.md
```

每个子目录是一个独立的插件包（根目录即包，`package.json` + `index.js` 宿主半边 + `client.js` 浏览器半边 + 自带的 `cordis.patch.yml`）。

## 安装：从 git 仓库（首选）

DSH 的插件管理器直接把 spec 转交 pnpm，而 pnpm 支持 git 依赖，**包括仓库子目录**（`#path:` 语法）。所以 monorepo 可以直接用，不需要拆成多个仓库：

```powershell
dsh plugin --profile desktop add "https://github.com/<你的用户名>/dsh-plugins#path:llm-retry-settings"
dsh plugin --profile desktop add "https://github.com/<你的用户名>/dsh-plugins#path:code-typer"
```

一条命令搞定全部登记：写入 `package.json` 的依赖、加入 `dsh.profile.bundles`、pnpm 硬链接到 `node_modules`、HMR 重载。无需 Junction、无需手动改配置、无需本脚本。

支持的 spec 形式：registry 包名、绝对本地路径、git 地址（`https://github.com/...`、`git+https://...`、`git+ssh://...`、`github:user/repo` 等简写）、tarball。私有仓库用系统 git 凭据助手认证（DSH 在启动 pnpm 前会用 `git ls-remote` 探活，超时 5 秒）。

**`#path:` 不能省略。** 这是 monorepo，仓库根没有 `package.json`。在设置 → 插件 的安装框里只填仓库地址（`https://github.com/<你>/Deepseek-Plugins.git`）会报「这个包没有声明组合包，不能作为插件管理」——因为 pnpm 把仓库根当成一个无清单的包装了进来。必须写成：

```
https://github.com/<你的用户名>/Deepseek-Plugins.git#path:llm-retry-settings
https://github.com/<你的用户名>/Deepseek-Plugins.git#path:code-typer
```

**注意：锁文件会把 git 依赖钉到具体 commit。** 所以推了新代码之后，别的机器要重新 add 一次才能拿到更新（先 `remove` 再 `add`，因为 spec 已安装时会被 `already-installed` 拒绝）：

```powershell
dsh plugin --profile desktop remove @local/llm-retry-settings
dsh plugin --profile desktop add "https://github.com/<你的用户名>/dsh-plugins#path:llm-retry-settings"
```

## 安装：用脚本（备用）

不想走 git（比如仓库还没推上去、或在局域网里）时用脚本，幂等可重复执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1                              # 装全部
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1 -Plugin llm-retry-settings   # 只装一个
```

两种模式：

| 模式 | 命令 | Junction 指向 | 更新方式 |
|---|---|---|---|
| copy（默认） | `tools\install.ps1` | `~/.dsh/local-plugins/<插件>` | `git pull` 后**重跑脚本** |
| in-place | `tools\install.ps1 -InPlace` | 这个 clone 里的工作副本 | `git pull` 即生效 |

copy 模式更稳（删掉 clone 不影响 DSH）；in-place 适合频繁迭代。改 `client.js` 只需刷新浏览器页面，改 `index.js` / `package.json` 需要重启 DSH。

**两种安装方式不要混用**：git 安装会把包放进 pnpm 的 `node_modules/.pnpm`，而脚本建的是 Junction，路径冲突。要换方式先卸掉原来的。

## 多台电脑同步（git 方式）

```powershell
# 每台电脑第一次
dsh plugin --profile desktop add "https://github.com/<你>/dsh-plugins#path:llm-retry-settings"
dsh plugin --profile desktop add "https://github.com/<你>/dsh-plugins#path:code-typer"

# 推更新后（在改动机器上）
git push
# 在其他机器上
dsh plugin --profile desktop remove @local/llm-retry-settings
dsh plugin --profile desktop add "https://github.com/<你>/dsh-plugins#path:llm-retry-settings"
```

profile 名不是 `desktop` 时把 `--profile` 换掉。另一台电脑需要已经装好 DSH 并至少跑过一次（profile 目录存在）。

## 新增一个插件

1. 在仓库根新建目录，放入 `package.json`（`name` 必须是 `@local/xxx` 这种带作用域的名字）、`index.js`、`client.js`、`cordis.patch.yml`
2. `git commit && git push`
3. `dsh plugin --profile desktop add "<仓库地址>#path:<新目录名>"`

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

```powershell
dsh plugin --profile desktop remove @local/llm-retry-settings
```

会同时移除依赖、取消 bundles 勾选，并卸载模块。脚本方式装的还要额外删掉 `~/.dsh/local-plugins/<插件>`。

## 各插件文档

- [code-typer](code-typer/README.md)
- [llm-retry-settings](llm-retry-settings/README.md)
