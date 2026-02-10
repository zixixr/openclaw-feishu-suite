# OpenClaw 自定义插件开发指南

> 所有自定义功能都应放在 `~/.openclaw/extensions/` 目录下，**不要修改** `~/openclaw/` 源码。
> 这样 `git pull` 更新 OpenClaw 后不会丢失任何自定义功能。

## 插件目录结构

```
~/.openclaw/extensions/<plugin-name>/
├── openclaw.plugin.json    ← 必需：插件清单
├── package.json             ← 必需：包描述（声明 extensions 入口）
├── index.ts                 ← 插件代码入口
└── skills/                  ← 可选：AI 引导文档
    └── <skill-name>/
        └── SKILL.md
```

## 必需文件模板

### openclaw.plugin.json

```json
{
  "id": "<plugin-name>",
  "name": "Human Readable Name",
  "description": "What this plugin does",
  "version": "1.0.0",
  "configSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

- `id` 必须唯一，不能与已有插件冲突
- `configSchema` 必须存在，即使为空对象 schema
- 可选字段：`kind`, `channels`, `providers`, `skills`, `uiHints`

### package.json

```json
{
  "name": "@openclaw-custom/<plugin-name>",
  "version": "1.0.0",
  "description": "...",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

- `openclaw.extensions` 声明入口文件路径
- 如果有多个入口文件可以列多个

### index.ts 基本结构

```typescript
import { createRequire } from "node:module";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// 从 app 的 node_modules 解析依赖（无需本地 npm install）
const appRequire = createRequire("/app/package.json");
const { Type } = appRequire("@sinclair/typebox");
// const SomeSDK = appRequire("some-package");

const plugin = {
  id: "<plugin-name>",
  name: "Human Readable Name",
  description: "What this plugin does",

  register(api: OpenClawPluginApi) {
    // 读取配置
    const config = api.config;

    // 注册工具
    api.registerTool(
      {
        name: "my_tool_name",
        label: "My Tool",
        description: "What this tool does",
        parameters: Type.Object({
          param1: Type.String({ description: "..." }),
        }),
        async execute(_toolCallId, params) {
          const { param1 } = params as { param1: string };
          try {
            const result = { /* ... */ };
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              details: result,
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }],
            };
          }
        },
      },
      { name: "my_tool_name" },
    );

    api.logger.info?.(`<plugin-name>: Registered N tools`);
  },
};

export default plugin;
```

## 依赖解析

插件通过 jiti 在运行时加载 TypeScript，**不经过编译步骤**。

### 可直接 import 的
- `openclaw/plugin-sdk` — jiti 自动别名解析
- `node:*` 内置模块 — Node.js 原生支持

### 需要通过 createRequire 解析的
app 镜像中已有但插件目录下没有的第三方包：
```typescript
const appRequire = createRequire("/app/package.json");
const Lark = appRequire("@larksuiteoapi/node-sdk");
const { Type } = appRequire("@sinclair/typebox");
const { z } = appRequire("zod");
```

### 常用可复用的 app 依赖
- `@larksuiteoapi/node-sdk` — 飞书 SDK
- `@sinclair/typebox` — 工具参数 schema 定义
- `zod` — 数据验证

## Skills (AI 引导文档)

Skills 是 markdown 文件，教 AI agent 如何使用你的工具。

```
skills/<skill-name>/SKILL.md
```

SKILL.md 格式：
```markdown
---
name: skill-name
description: |
  When to activate this skill. Keywords the AI should match.
---

# Skill Title

## Tools

### tool_name_1
Description and example usage...

### tool_name_2
...
```

## 读取飞书凭据的标准模式

飞书配置有两种格式，插件应同时兼容：

```typescript
function resolveFeishuCredentials(config: any) {
  const feishu = config?.channels?.feishu;
  if (!feishu) return null;

  // 1. 多账户格式 (accounts.main.appId)
  if (feishu.accounts && typeof feishu.accounts === "object") {
    for (const account of Object.values(feishu.accounts)) {
      const a = account as any;
      const appId = (a.appId ?? feishu.appId)?.trim();
      const appSecret = (a.appSecret ?? feishu.appSecret)?.trim();
      if (appId && appSecret) {
        return { appId, appSecret, domain: a.domain ?? feishu.domain };
      }
    }
  }

  // 2. 旧格式 (顶层 appId)
  if (feishu.appId?.trim() && feishu.appSecret?.trim()) {
    return { appId: feishu.appId.trim(), appSecret: feishu.appSecret.trim(), domain: feishu.domain };
  }

  return null;
}
```

## 插件加载顺序

OpenClaw 按以下顺序发现插件：
1. **config 指定路径** (`plugins.entries[id].path`)
2. **workspace 扩展** (`<workspace>/.openclaw/extensions/`)
3. **全局扩展** (`~/.openclaw/extensions/`) ← 我们的插件在这里
4. **内置插件** (`/app/extensions/`)

同名插件 (相同 `id`) 先发现的优先，后面的会被跳过。

## 避免与内置插件冲突

- **工具名冲突**：如果内置插件注册了同名工具，全局插件先加载会优先
- **插件 ID 冲突**：`openclaw.plugin.json` 的 `id` 不能与内置插件重复
- 查看内置插件列表：`ls ~/openclaw/extensions/`

## 部署流程

```bash
# 1. 在 VM 上创建插件目录
ssh azureuser@20.194.30.206
mkdir -p ~/.openclaw/extensions/<plugin-name>/skills/<skill-name>

# 2. 上传文件（从本地）
scp index.ts package.json openclaw.plugin.json azureuser@20.194.30.206:~/.openclaw/extensions/<plugin-name>/
scp SKILL.md azureuser@20.194.30.206:~/.openclaw/extensions/<plugin-name>/skills/<skill-name>/

# 3. 重启 gateway（不需要重建 Docker 镜像！）
ssh azureuser@20.194.30.206 "docker stop openclaw-gateway && docker rm openclaw-gateway"
# 然后执行标准 docker run 命令

# 4. 验证
ssh azureuser@20.194.30.206 "docker logs openclaw-gateway 2>&1 | grep '<plugin-name>'"
```

**注意**：添加/修改自定义插件不需要重建 Docker 镜像，只需重启 gateway 容器即可。

## 更新 OpenClaw 后

```bash
cd ~/openclaw && git pull
docker build -t openclaw:local --build-arg OPENCLAW_DOCKER_APT_PACKAGES='chromium' .
docker stop openclaw-gateway && docker rm openclaw-gateway
# 执行标准 docker run，自定义插件自动加载
```

## 现有自定义插件清单

| 插件 ID | Git 源码 | VM 部署位置 | 工具数 | 用途 |
|---------|----------|------------|--------|------|
| feishu-bitable | `plugins/feishu-bitable/` | `~/.openclaw/extensions/feishu-bitable/` | 18 | 飞书多维表格完整 CRUD |

## 从 Git 部署到新 VM

```bash
# 从项目根目录上传插件文件到 VM
scp -r plugins/<plugin-name>/* azureuser@<VM_IP>:~/.openclaw/extensions/<plugin-name>/
# 重启 gateway
ssh azureuser@<VM_IP> "docker stop openclaw-gateway && docker rm openclaw-gateway"
# 然后执行标准 docker run 命令
```
