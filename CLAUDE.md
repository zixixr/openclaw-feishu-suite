# OpenClaw Deployment Memory

## Azure VM Details
- **Resource Group**: rg-openclaw-korea
- **VM Name**: vm-openclaw
- **Location**: Korea Central
- **Size**: Standard_D4as_v5 (4 cores / 16GB RAM / 64GB disk)
- **Public IP**: 20.194.30.206
- **SSH User**: azureuser
- **OS**: Ubuntu 24.04 LTS

## OpenClaw Setup
- **Version**: 2026.2.23
- **Docker Image**: openclaw:local
- **Gateway Port**: 18789 (not publicly exposed, use SSH tunnel)
- **Gateway Token**: 31ab8657fc80a1ab239d4951e540234f6d36b9d7771e79d4a6f7850582fcf292
- **Config File**: /home/azureuser/.openclaw/openclaw.json

## Gateway Runtime (IMPORTANT)
Gateway runs via `docker run` with `--network host`, **NOT** via docker-compose:
```bash
docker run -d --name openclaw-gateway --restart unless-stopped --network host \
  -v /home/azureuser/.openclaw:/home/node/.openclaw \
  -v /home/azureuser/.openclaw/workspace:/home/node/.openclaw/workspace \
  -e HOME=/home/node -e TERM=xterm-256color \
  -e OPENCLAW_GATEWAY_TOKEN=31ab8657fc80a1ab239d4951e540234f6d36b9d7771e79d4a6f7850582fcf292 \
  --init openclaw:local node dist/index.js gateway --bind loopback --port 18789
```

## Multi-Agent Setup
Four agents configured with different models:

| Agent ID | Name | Model | Purpose |
|----------|------|-------|---------|
| main (default) | Main (Codex) | azure/gpt-5.2-codex | General coding, primary agent |
| creative | Creative (Gemini) | google-antigravity/gemini-3-pro-high | Image generation, creative tasks |
| thinking | Deep Thinking (Opus) | google-antigravity/claude-opus-4-5-thinking | Complex analysis, deep reasoning |
| claude | Claude (Opus) | anthropic/claude-opus-4-6 | Direct Anthropic Claude via OAuth |

### Agent Workspaces
- **main**: `~/.openclaw/workspace` (with IDENTITY.md, AGENTS.md, SOUL.md)
- **creative**: `~/.openclaw/workspace-creative` (with SOUL.md for creative persona)
- **thinking**: `~/.openclaw/workspace-thinking` (with SOUL.md for reasoning persona)
- **claude**: `~/.openclaw/workspace-claude` (with SOUL.md)

### Agent Auth Profiles
Each agent has its own auth-profiles.json at `~/.openclaw/agents/<agentId>/agent/`:
- Google Antigravity OAuth (xiaotongyang1@gmail.com) copied to all four agents
- Anthropic OAuth (xiaotongyang1@gmail.com) copied to all four agents

### Switching Models
- Users can use `/model` command in Feishu to switch models on the fly
- Use `/model anthropic/claude-sonnet-4-5` to switch to Claude Sonnet 4.5
- Use `/model anthropic/claude-opus-4-6` to switch to Claude Opus 4.6
- Specific Feishu groups can be bound to agents via `bindings` in config (not yet configured)

## AI Model Providers
### Azure OpenAI (custom provider "azure")
- **Base URL**: https://xiaotong-ai-hub-resource.openai.azure.com/openai/v1
- **API**: openai-responses (NOT openai-completions - codex models require Responses API)
- **Models**: gpt-5.2-codex, gpt-5.2, gpt-5.1, gpt-5.1-codex-max, gpt-4o

### Google Antigravity (OAuth)
- **Auth**: OAuth via xiaotongyang1@gmail.com
- **Models**: gemini-3-pro-high, claude-opus-4-5-thinking (and others available via Antigravity)

### Anthropic (OAuth — Claude Max subscription)
- **Auth**: OAuth via xiaotongyang1@gmail.com (Claude Max)
- **Plugin**: `anthropic-auth` (custom, at `~/.openclaw/extensions/anthropic-auth/`)
- **OAuth endpoints**: authorize=`claude.ai/oauth/authorize`, token=`console.anthropic.com/v1/oauth/token`
- **Token**: auto-refreshes via plugin's `refreshOAuth`; access token starts with `sk-ant-oat01-`
- **Models** (22 total): claude-opus-4-6, claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5, etc.
- **Token exchange quirk**: must include `state` field in the JSON body (not just `code_verifier`)

## Feishu Integration
- **Plugin**: @openclaw/feishu (bundled, enabled)
- **App ID**: cli_a98a4ff62ef9100b
- **Bot Open ID**: ou_15132f9ab795d64a2edfe5f60fe589fe
- **Mode**: WebSocket long connection
- **DM Policy**: pairing (new users need approval)

## Browser
- **Chromium** installed in Docker image (rebuild with OPENCLAW_DOCKER_APT_PACKAGES)
- **Config**: headless=true, noSandbox=true
- Note: Browser-based web search gets CAPTCHAs; web_search tool (Brave/Perplexity) not configured

## Security
- fail2ban: enabled (5 retries, 1hr ban)
- UFW firewall: enabled (only SSH port 22)
- Automatic security updates: enabled
- NSG: SSH open to all (SSH key auth only)

## Common Commands
```bash
# SSH into VM
ssh azureuser@20.194.30.206

# SSH tunnel for Control UI
ssh -L 18789:127.0.0.1:18789 azureuser@20.194.30.206

# Gateway management (docker run, NOT docker-compose)
docker restart openclaw-gateway
docker logs --tail 50 openclaw-gateway
docker exec openclaw-gateway node dist/index.js agents list --bindings
docker exec openclaw-gateway node dist/index.js health

# Feishu pairing
docker exec openclaw-gateway node dist/index.js pairing list feishu
docker exec openclaw-gateway node dist/index.js pairing approve feishu <CODE>

# Device pairing (Control UI)
docker exec openclaw-gateway node dist/index.js devices approve <requestId>
```

## Custom Plugins (Persistent) — see [docs/custom-plugin-guide.md](docs/custom-plugin-guide.md)
Custom plugins go in `~/.openclaw/extensions/`, **NOT** `~/openclaw/extensions/`. Survives `git pull`.
Each plugin needs: `openclaw.plugin.json` (id + configSchema), `package.json` (openclaw.extensions), `index.ts`.
Use `createRequire("/app/package.json")` to resolve app dependencies without local npm install.
Adding/modifying plugins only requires gateway restart, NOT Docker rebuild.

### Current custom plugins (dispatcher pattern — 1 tool per plugin, multiple actions)
| Plugin | Source (git) | VM Location | Tools | Actions | Purpose |
|--------|-------------|-------------|-------|---------|---------|
| feishu-bitable | `plugins/feishu-bitable/` | `~/.openclaw/extensions/feishu-bitable/` | 1 | 22 | Bitable CRUD, search, batch ops, fields, views, app/table creation, attachment copy/upload |
| feishu-calendar | `plugins/feishu-calendar/` | `~/.openclaw/extensions/feishu-calendar/` | 1 | 7 | Calendar events CRUD, free/busy check, attendee management |
| feishu-sheets | `plugins/feishu-sheets/` | `~/.openclaw/extensions/feishu-sheets/` | 1 | 6 | Spreadsheet read/write cells, append rows, set column widths |
| feishu-messaging | `plugins/feishu-messaging/` | `~/.openclaw/extensions/feishu-messaging/` | 1 | 5 | Send messages/cards, reply, list chats and members |
| feishu-task | `plugins/feishu-task/` | `~/.openclaw/extensions/feishu-task/` | 1 | 5 | Task create/list/update/complete with assignees and due dates |
| feishu-contacts | `plugins/feishu-contacts/` | `~/.openclaw/extensions/feishu-contacts/` | 1 | 3 | Lookup users by email/phone, get profiles, search directory |
| feishu-permission | `plugins/feishu-permission/` | `~/.openclaw/extensions/feishu-permission/` | 1 | 3 | Grant/list/revoke doc permissions |
| feishu-doc-enhanced | `plugins/feishu-doc-enhanced/` | `~/.openclaw/extensions/feishu-doc-enhanced/` | 1 | 5 | Rich doc creation with FULL table support, list blocks, update table column widths |
| anthropic-auth | `plugins/anthropic-auth/` | `~/.openclaw/extensions/anthropic-auth/` | 0 | 0 | Anthropic OAuth provider for Claude Pro/Max subscriptions |

**Total tools**: 8 custom + ~4 built-in = ~12 (down from ~49 before consolidation)

### Deploy plugins + patches to VM
```bash
# One-command deploy (plugins + patches + restart):
./deploy.sh

# Or selectively:
./deploy.sh plugins   # upload plugins only
./deploy.sh patches   # apply container patches only
./deploy.sh restart   # just restart gateway
```

### Container Patches (`patches/`)
Patches modify bundled code inside the Docker container. They are **lost on container recreation**
(`docker run`) but survive `docker restart`. Always re-run `./deploy.sh patches` after recreating the container.

| Patch | Target | Purpose |
|-------|--------|---------|
| `bot-media-path.py` | `/app/extensions/feishu/src/bot.ts` | Append inbound media file paths to message body (fixes Media Understanding suppressing paths) |

## Lessons Learned
- `agents.defaults.reasoning` is NOT a valid config key in OpenClaw 2026.2.4
- `systemPrompt` is NOT a valid key in `agents.list[]` - use SOUL.md in workspace instead
- Azure OpenAI codex models require `openai-responses` API (NOT `openai-completions`)
- Azure OpenAI configured as custom provider via `models.providers.azure`
- Feishu plugin is bundled in the repo at `extensions/feishu/`
- Non-interactive onboard: use `--non-interactive --accept-risk --auth-choice skip`
- CLAUDE_* env warnings are harmless (only needed for Anthropic/Claude provider)
- Auth profiles are per-agent; copy `auth-profiles.json` to each agent's `agentDir`
- Gateway must run with `--network host` for Control UI pairing and OAuth callbacks
- OAuth callback: use "Paste the redirect URL" fallback method when running in Docker
- Custom plugins go in `~/.openclaw/extensions/`, NOT in `~/openclaw/extensions/` (survives updates)
- Global extensions need `openclaw.plugin.json` manifest with `id` and `configSchema`
- Bundled feishu bitable.ts has a multi-account credential bug (checks `feishuCfg?.appId` instead of `listEnabledFeishuAccounts`); our standalone plugin works around this
- Plugin TypeScript files are loaded at runtime via jiti (not compiled at build time)
- Lark SDK uses flat naming: `client.drive.permissionMember.create` (NOT `client.drive.permission.member.create`)
- Check SDK namespace keys with `Object.keys(client.<namespace>)` before assuming nested paths
- Built-in `feishu_doc` write strips Table blocks (type 31/32) via `UNSUPPORTED_CREATE_TYPES` in `docx.ts:55`; the Feishu API DOES support them — use `feishu-doc-enhanced` plugin instead
- Too many tool definitions can exceed gpt-5.2-codex context window; consolidate tools (e.g. manage_fields=list/create/update/delete) and keep descriptions minimal
- Lark SDK `drive.media.download()` returns `{ writeFile, getReadableStream, headers }`, NOT standard `{ code, data }` — use `res.getReadableStream()` to read file content
- Never put base64 file content into model context (tool responses); do file operations server-side in the plugin
- Bitable text fields (type 1) are rich text arrays `[{text:"...", type:"text"}]` — use `fieldToString()` helper, NOT `String()` which gives `[object Object]`
- Lark SDK `drive.media.uploadAll()` returns `{file_token:"..."}` directly, NOT `{code:0, data:{file_token:"..."}}` — check `res.data?.file_token ?? res.file_token`
- 49+ total tool definitions exceed gpt-5.2-codex context window; solved by consolidating each plugin into 1 dispatcher tool with `action` + `params` pattern (49→12 tools, 53 actions preserved)
- Anthropic OAuth token exchange requires `state` field in JSON body alongside `code_verifier`
- Anthropic OAuth redirect URI in pi-ai is `console.anthropic.com` but actual redirect goes to `platform.claude.com`; use original `console.anthropic.com` in token exchange
- Anthropic OAuth scopes: `org:create_api_key user:profile user:inference` (no `user:inference` = no model access)
- OAuth plugin `providers` array in `openclaw.plugin.json` tells OpenClaw which provider this plugin registers
- Media Understanding processes inbound images → generates description + multimodal content → **suppresses `[media attached: /path]` note** → model can SEE image but doesn't know file path; fixed with `patches/bot-media-path.py`
- Container patches (`patches/*.py`) survive `docker restart` but are **lost on `docker run`** (container recreation); always re-run `./deploy.sh patches` after recreating
- Feishu docx `documentBlock.patch` update_table_property requires **per-column** updates: `{ column_index: i, column_width: px }`, NOT array. Loop to update all columns
- OpenClaw 2026.2.23 removed bundled `google-antigravity-auth` plugin; remove from `plugins.entries` in config if upgrading from older versions
