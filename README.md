<div align="center">
    <h1>AI Switch</h1>
    <h3><em>One CLI for Codex and Claude Code API providers</em></h3>
</div>

<p align="center">
    <strong>Safely manage API keys, relay endpoints, and models for Codex and Claude Code. Discover available models from each provider, switch profiles interactively, diagnose configuration problems, and restore automatic backups.</strong>
</p>

<p align="center">
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

Current version: **0.2.0**

## Contents

- [Why AI Switch](#why-ai-switch)
- [Features](#features)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Model discovery](#model-discovery)
- [Client compatibility](#client-compatibility)
- [Security](#security)
- [Configuration files](#configuration-files)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Why AI Switch

API relay tools sometimes update only their own UI state or write fields that the target client does not understand. The client then falls back to its official endpoint and sends a relay API key to the wrong service, resulting in errors such as:

```text
401 Unauthorized: Incorrect API key provided
url: https://api.openai.com/v1/responses
auth error code: invalid_api_key
```

AI Switch updates the files that Codex and Claude Code actually read, keeps unrelated settings intact, and verifies the effective endpoint before you start a new session.

## Features

1. **Codex and Claude Code support**: Manage both clients from one command-line interface.
2. **Multiple provider profiles**: Save official API and relay configurations side by side.
3. **Live model discovery**: Query the provider's `GET /models` endpoint and choose from the models available to the current API key.
4. **Safe credential helpers**: Keep API keys out of Codex `config.toml` and Claude Code `settings.json`.
5. **Atomic configuration writes**: Avoid partially written files when a process is interrupted.
6. **Automatic backups**: Snapshot the target configuration before every switch.
7. **Diagnostics**: Check active profiles, file permissions, expected request paths, authentication helpers, and provider connectivity.
8. **Non-destructive updates**: Preserve unrelated Codex and Claude Code settings.
9. **Zero runtime dependencies**: Uses only Node.js built-in modules.
10. **Cross-platform paths**: Supports macOS, Linux, and Windows configuration locations through environment overrides.

## How it works

### Codex

AI Switch creates a custom Codex model provider in `~/.codex/config.toml`:

```toml
model_provider = "aiswitch"
model = "your-selected-model"

[model_providers.aiswitch]
name = "Your Provider"
base_url = "https://relay.example/v1"
wire_api = "responses"
auth = { command = "/path/to/node", args = ["/path/to/token.js", "codex", "profile-name"] }
```

The provider uses Codex's command-backed bearer authentication. The API key is read only when Codex needs it and is never embedded in `config.toml`.

### Claude Code

AI Switch updates the user-level `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://relay.example",
    "ANTHROPIC_MODEL": "your-selected-model"
  },
  "apiKeyHelper": "'/path/to/node' '/path/to/token.js' 'claude' 'profile-name'"
}
```

Claude Code's `apiKeyHelper` supplies the API credential at request time. Existing unrelated settings remain unchanged.

## Installation

### Requirements

- Node.js 20 or newer
- Codex CLI or desktop app for Codex profiles
- Claude Code for Claude profiles

### Install from source

```bash
git clone https://github.com/0xfnzero/ai-switch.git
cd ai-switch
npm install -g .
```

Verify the installation:

```bash
ai-switch --version
```

You can also run the CLI without installing it globally:

```bash
node ./bin/ai-switch.js
```

## Quick start

Launch the interactive menu:

```bash
ai-switch
```

Or add a provider directly:

```bash
ai-switch add codex
ai-switch add claude
```

The setup flow asks for:

1. A local profile name
2. A display name
3. The provider base URL
4. The API key, with hidden terminal input
5. A model selected from the provider's live model catalog

After activation, restart the target application or create a new session so it reloads the provider configuration.

## Commands

### Interactive menu

```bash
ai-switch
```

Provides actions for adding providers, switching providers, changing models, listing profiles, running diagnostics, and restoring backups.

### Add or update a provider

```bash
ai-switch add
ai-switch add codex
ai-switch add claude
```

### List profiles

```bash
ai-switch list
ai-switch list codex
ai-switch list claude
```

The active profile is marked with `*`. API keys are always masked.

### Switch the active provider

```bash
ai-switch use codex my-relay
ai-switch use claude my-relay
```

When the target or profile is omitted, AI Switch opens an interactive selector.

### Refresh and change a model

```bash
ai-switch model
ai-switch model codex my-relay
ai-switch model claude my-relay
```

AI Switch retrieves the latest model catalog using the profile's saved endpoint and credential, then updates the selected model. If the profile is active, the client configuration is updated immediately.

### Run diagnostics

```bash
ai-switch doctor
ai-switch doctor --probe
```

`--probe` sends a non-inference `GET /models` request. It does not create a model response, although a relay provider may apply its own request accounting.

### Manage backups

```bash
ai-switch backup list
ai-switch backup restore
ai-switch backup restore <backup-name>
```

Restoring a backup first creates a safety backup of the current files.

### Remove an inactive profile

```bash
ai-switch remove codex old-relay
ai-switch remove claude old-relay
```

An active profile cannot be removed until another profile is selected or a backup is restored.

## Model discovery

AI Switch uses the configured provider rather than a hard-coded model list:

- Codex profiles request `<base-url>/models`.
- Claude Code profiles request `<base-url>/v1/models`, unless the base URL already ends in `/v1`.
- OpenAI-style `data` arrays and relay-style `models` arrays are supported.
- Duplicate model IDs are removed.
- Models with `created` or `created_at` metadata are displayed newest first.
- Providers without creation metadata retain their server-defined order.
- Manual model entry remains available as a fallback.

The model endpoint may advertise embeddings, audio, image, or other models that the target coding client cannot use. Select a model compatible with the client's request protocol.

## Client compatibility

### Codex and relay providers

Codex currently uses the Responses API for custom providers. A compatible relay must implement:

```text
POST <base-url>/responses
```

For example, a base URL of `https://relay.example/v1` results in requests to:

```text
https://relay.example/v1/responses
```

A service that only implements `/chat/completions` is not directly compatible with Codex. Custom local providers also do not automatically carry over to Work Cloud execution environments.

### Claude Code and relay providers

Claude Code relays must support the Anthropic Messages API:

```text
POST <base-url>/v1/messages
```

Most Anthropic-compatible relays expect `ANTHROPIC_BASE_URL` without the `/v1` suffix. Follow the relay provider's documentation when its URL convention differs.

## Security

- Credentials are stored locally in `~/.ai-switch/profiles.json` so profiles can be switched later.
- The profile file is written with `0600` permissions and its directory with `0700` permissions on POSIX systems.
- Codex and Claude Code target configuration files do not contain plaintext API keys.
- API keys are masked in list, diagnostic, and error output.
- Provider response bodies are redacted if they echo the submitted credential.
- Base URLs containing embedded usernames or passwords are rejected.
- Configuration writes use a temporary file followed by an atomic rename.

Do not commit `~/.ai-switch`, `~/.codex`, or `~/.claude` to version control.

## Configuration files

| Purpose | Default path |
|---|---|
| AI Switch profiles | `~/.ai-switch/profiles.json` |
| Automatic backups | `~/.ai-switch/backups/` |
| Codex configuration | `~/.codex/config.toml` |
| Claude Code settings | `~/.claude/settings.json` |

Override the default directories when testing or using a custom installation:

```bash
AI_SWITCH_HOME=/path/to/state
CODEX_HOME=/path/to/codex
CLAUDE_CONFIG_DIR=/path/to/claude
```

## Troubleshooting

### Codex still requests `api.openai.com`

1. Run `ai-switch doctor` and confirm the active provider is `aiswitch`.
2. Confirm the displayed base URL is the relay URL.
3. Restart Codex completely and create a new session.
4. Check whether the session is local; custom providers do not automatically apply to Work Cloud.

### Model discovery returns 401 or 403

- Confirm the API key belongs to the configured relay.
- Confirm the relay accepts Bearer authentication for Codex or `x-api-key` for Claude Code.
- Check whether the relay exposes its model catalog at `/models`.
- Use the manual model-name fallback when the relay does not implement model discovery.

### Claude Code ignores the selected credential

An existing `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` in the launch environment can override `apiKeyHelper`. Remove the conflicting environment variable and start a new Claude Code session.

## Project structure

```text
ai-switch/
├── bin/ai-switch.js       # Executable entry point
├── src/
│   ├── backup.js          # Backup and restore operations
│   ├── cli.js             # Commands and interactive workflows
│   ├── config.js          # Codex TOML and Claude JSON updates
│   ├── fs-safe.js         # Atomic private file writes
│   ├── paths.js           # Platform configuration paths
│   ├── probe.js           # Model discovery and connectivity checks
│   ├── prompt.js          # Dependency-free terminal prompts
│   ├── store.js           # Profile validation and persistence
│   └── token.js           # Credential helper entry point
└── test/                  # Unit and integration tests
```

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

The test suite uses temporary home directories and local HTTP servers. It never modifies your real Codex or Claude Code configuration.

## References

- [Codex configuration reference](https://learn.chatgpt.com/codex/config-file/config-reference)
- [Codex advanced configuration](https://learn.chatgpt.com/codex/config-file/config-advanced)
- [OpenAI List models API](https://developers.openai.com/api/reference/resources/models/methods/list)
- [Claude Code settings](https://code.claude.com/docs/en/settings-reference)

## License

Licensed under the [MIT License](LICENSE).
