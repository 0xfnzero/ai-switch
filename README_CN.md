<div align="center">
    <h1>AI Switch</h1>
    <h3><em>一条命令管理 Codex 与 Claude Code 的 API 服务商</em></h3>
</div>

<p align="center">
    <strong>安全管理 Codex 与 Claude Code 的 API Key、中转地址和模型。自动发现服务商支持的最新模型，交互式切换配置，诊断连接问题，并随时恢复自动备份。</strong>
</p>

<p align="center">
    <a href="https://github.com/0xfnzero/ai-switch/actions/workflows/ci.yml"><img src="https://github.com/0xfnzero/ai-switch/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/0xfnzero/ai-switch/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
    <a href="https://github.com/0xfnzero/ai-switch"><img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white" alt="Node.js 20+"></a>
    <a href="https://github.com/0xfnzero/ai-switch"><img src="https://img.shields.io/github/stars/0xfnzero/ai-switch?style=social" alt="GitHub stars"></a>
    <a href="https://github.com/0xfnzero/ai-switch/network"><img src="https://img.shields.io/github/forks/0xfnzero/ai-switch?style=social" alt="GitHub forks"></a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/Codex-111111?style=for-the-badge&logo=openai&logoColor=white" alt="Codex">
    <img src="https://img.shields.io/badge/Claude_Code-D97757?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code">
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
</p>

<p align="center">
    <a href="https://github.com/0xfnzero/ai-switch/blob/main/README_CN.md">中文</a> |
    <a href="https://github.com/0xfnzero/ai-switch/blob/main/README.md">English</a>
</p>

当前版本：**0.2.0**

## 目录

- [为什么需要 AI Switch](#为什么需要-ai-switch)
- [功能特性](#功能特性)
- [工作方式](#工作方式)
- [安装](#安装)
- [快速开始](#快速开始)
- [命令说明](#命令说明)
- [模型发现](#模型发现)
- [客户端兼容性](#客户端兼容性)
- [安全设计](#安全设计)
- [配置文件](#配置文件)
- [故障排查](#故障排查)
- [开发](#开发)
- [许可证](#许可证)

## 为什么需要 AI Switch

一些 API 中转管理工具只更新自身界面状态，或者写入目标客户端无法识别的配置字段。客户端随后会回退到官方地址，并把中转站 API Key 发送给错误的服务，最终出现类似错误：

```text
401 Unauthorized: Incorrect API key provided
url: https://api.openai.com/v1/responses
auth error code: invalid_api_key
```

AI Switch 直接更新 Codex 和 Claude Code 实际读取的配置文件，保留其他无关设置，并在新会话开始前帮助你确认真正生效的请求地址。

## 功能特性

1. **同时支持 Codex 与 Claude Code**：通过一个命令行工具管理两个客户端。
2. **多服务商配置**：并排保存官方 API 与多个中转站配置。
3. **实时发现模型**：请求服务商的 `GET /models` 接口，让用户从当前 API Key 实际可用的模型中选择。
4. **安全凭据助手**：API Key 不会写入 Codex 的 `config.toml` 或 Claude Code 的 `settings.json`。
5. **原子写入配置**：避免进程中断时留下只写了一半的配置文件。
6. **自动备份**：每次切换前自动保存目标配置。
7. **配置诊断**：检查当前配置、文件权限、预期请求路径、凭据助手和服务商连通性。
8. **非破坏性更新**：保留 Codex 与 Claude Code 中不相关的设置。
9. **零运行时依赖**：只使用 Node.js 内置模块。
10. **跨平台路径**：支持 macOS、Linux、Windows，并允许通过环境变量覆盖配置目录。

## 工作方式

### Codex

AI Switch 会在 `~/.codex/config.toml` 中创建一个 Codex 自定义模型服务商：

```toml
model_provider = "aiswitch"
model = "your-selected-model"

[model_providers.aiswitch]
name = "Your Provider"
base_url = "https://relay.example/v1"
wire_api = "responses"
auth = { command = "/path/to/node", args = ["/path/to/token.js", "codex", "profile-name"] }
```

该配置使用 Codex 支持的命令式 Bearer Token 认证。只有 Codex 发起请求时才会读取 API Key，`config.toml` 中不会出现明文密钥。

### Claude Code

AI Switch 会更新用户级配置 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://relay.example",
    "ANTHROPIC_MODEL": "your-selected-model"
  },
  "apiKeyHelper": "'/path/to/node' '/path/to/token.js' 'claude' 'profile-name'"
}
```

Claude Code 会通过 `apiKeyHelper` 在请求时获取凭据，已有的其他设置保持不变。

## 安装

### 环境要求

- Node.js 20 或更高版本
- 使用 Codex 配置时需安装 Codex CLI 或桌面应用
- 使用 Claude 配置时需安装 Claude Code

### 从源码安装

```bash
git clone https://github.com/0xfnzero/ai-switch.git
cd ai-switch
npm install -g .
```

验证安装：

```bash
ai-switch --version
```

也可以不全局安装，直接运行：

```bash
node ./bin/ai-switch.js
```

## 快速开始

启动交互式菜单：

```bash
ai-switch
```

也可以直接添加服务商：

```bash
ai-switch add codex
ai-switch add claude
```

配置过程会依次询问：

1. 本地配置名称
2. 显示名称
3. 服务商 Base URL
4. API Key，终端输入会隐藏
5. 从服务商实时模型列表中选择模型

激活配置后，请彻底重启目标应用或新建会话，使其重新加载服务商配置。

## 命令说明

### 交互式菜单

```bash
ai-switch
```

可以添加、切换服务商，更换模型，查看配置，运行诊断以及恢复备份。

### 添加或更新服务商

```bash
ai-switch add
ai-switch add codex
ai-switch add claude
```

### 查看配置

```bash
ai-switch list
ai-switch list codex
ai-switch list claude
```

当前生效的配置会显示 `*`，API Key 始终以掩码形式展示。

### 切换当前服务商

```bash
ai-switch use codex my-relay
ai-switch use claude my-relay
```

省略客户端或配置名时，AI Switch 会打开交互式选择器。

### 刷新并更换模型

```bash
ai-switch model
ai-switch model codex my-relay
ai-switch model claude my-relay
```

AI Switch 会使用已保存的地址和凭据获取最新模型列表，并更新选中的模型。如果该配置当前正在使用，客户端配置会立即同步更新。

### 运行诊断

```bash
ai-switch doctor
ai-switch doctor --probe
```

`--probe` 只发送不触发推理的 `GET /models` 请求，不会创建模型回复，但中转服务商仍可能按自己的规则统计请求。

### 管理备份

```bash
ai-switch backup list
ai-switch backup restore
ai-switch backup restore <backup-name>
```

恢复备份前，AI Switch 会先为当前文件创建一份安全备份。

### 删除未启用的配置

```bash
ai-switch remove codex old-relay
ai-switch remove claude old-relay
```

当前正在使用的配置不能直接删除，请先切换到其他配置或恢复备份。

## 模型发现

AI Switch 使用服务商实时数据，不内置容易过期的模型列表：

- Codex 配置请求 `<base-url>/models`。
- Claude Code 配置请求 `<base-url>/v1/models`；如果 Base URL 已以 `/v1` 结尾，则不会重复追加。
- 支持 OpenAI 风格的 `data` 数组和中转站常见的 `models` 数组。
- 自动去除重复的模型 ID。
- 包含 `created` 或 `created_at` 元数据时，按发布时间从新到旧展示。
- 没有发布时间时，保留服务端返回顺序。
- 不支持模型发现的服务商仍可手动输入模型名。

模型接口可能同时返回嵌入、音频、图像等编码客户端无法使用的模型，请选择与目标客户端请求协议兼容的模型。

## 客户端兼容性

### Codex 与中转服务商

Codex 的自定义服务商目前使用 Responses API，中转站必须实现：

```text
POST <base-url>/responses
```

例如 Base URL 为 `https://relay.example/v1` 时，实际请求地址是：

```text
https://relay.example/v1/responses
```

只实现 `/chat/completions` 的服务无法直接用于 Codex。自定义本地服务商配置也不会自动同步到 Work Cloud 执行环境。

### Claude Code 与中转服务商

Claude Code 中转站必须支持 Anthropic Messages API：

```text
POST <base-url>/v1/messages
```

大多数兼容 Anthropic 的中转站要求 `ANTHROPIC_BASE_URL` 不包含 `/v1` 后缀；如果服务商约定不同，请以其文档为准。

## 安全设计

- 凭据保存在本地 `~/.ai-switch/profiles.json`，以便之后切换配置。
- 在 POSIX 系统中，配置文件权限为 `0600`，目录权限为 `0700`。
- Codex 与 Claude Code 的目标配置文件不会包含明文 API Key。
- 列表、诊断和错误输出中的 API Key 始终会被掩码处理。
- 如果服务商响应正文回显了提交的凭据，AI Switch 会自动脱敏。
- 拒绝包含用户名或密码的 Base URL。
- 配置写入采用临时文件加原子重命名。

请勿将 `~/.ai-switch`、`~/.codex` 或 `~/.claude` 提交到版本控制。

## 配置文件

| 用途 | 默认路径 |
|---|---|
| AI Switch 配置 | `~/.ai-switch/profiles.json` |
| 自动备份 | `~/.ai-switch/backups/` |
| Codex 配置 | `~/.codex/config.toml` |
| Claude Code 配置 | `~/.claude/settings.json` |

测试或自定义安装时，可以覆盖默认目录：

```bash
AI_SWITCH_HOME=/path/to/state
CODEX_HOME=/path/to/codex
CLAUDE_CONFIG_DIR=/path/to/claude
```

## 故障排查

### Codex 仍然请求 `api.openai.com`

1. 运行 `ai-switch doctor`，确认当前服务商为 `aiswitch`。
2. 确认显示的 Base URL 是中转站地址。
3. 彻底重启 Codex 并新建会话。
4. 确认会话在本地运行；自定义服务商不会自动应用到 Work Cloud。

### 模型发现返回 401 或 403

- 确认 API Key 属于当前配置的中转站。
- 确认 Codex 中转站接受 Bearer 认证，或 Claude Code 中转站接受 `x-api-key`。
- 检查中转站是否通过 `/models` 提供模型列表。
- 中转站不支持模型发现时，使用手动输入模型名选项。

### Claude Code 忽略所选凭据

启动环境中已有的 `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY` 可能覆盖 `apiKeyHelper`。请移除冲突的环境变量，然后新建 Claude Code 会话。

## 项目结构

```text
ai-switch/
├── bin/ai-switch.js       # 可执行入口
├── src/
│   ├── backup.js          # 备份与恢复
│   ├── cli.js             # 命令与交互流程
│   ├── config.js          # 更新 Codex TOML 与 Claude JSON
│   ├── fs-safe.js         # 私密文件原子写入
│   ├── paths.js           # 跨平台配置路径
│   ├── probe.js           # 模型发现与连通性检查
│   ├── prompt.js          # 零依赖终端交互
│   ├── store.js           # 配置校验与持久化
│   └── token.js           # 凭据助手入口
└── test/                  # 单元与集成测试
```

## 开发

```bash
npm test
npm run check
npm pack --dry-run
```

测试使用临时 Home 目录和本地 HTTP 服务，不会修改真实的 Codex 或 Claude Code 配置。

## 参考资料

- [Codex 配置参考](https://learn.chatgpt.com/codex/config-file/config-reference)
- [Codex 高级配置](https://learn.chatgpt.com/codex/config-file/config-advanced)
- [OpenAI 模型列表 API](https://developers.openai.com/api/reference/resources/models/methods/list)
- [Claude Code 设置](https://code.claude.com/docs/en/settings-reference)

## 许可证

本项目使用 [MIT License](LICENSE)。
