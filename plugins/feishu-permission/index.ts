/**
 * Feishu Permission plugin for OpenClaw — single dispatcher tool.
 */
import { createRequire } from "node:module";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const appRequire = createRequire("/app/package.json");
const Lark = appRequire("@larksuiteoapi/node-sdk");
const { Type } = appRequire("@sinclair/typebox");

type FeishuDomain = "feishu" | "lark" | (string & {});

function json(data: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data }; }

const clientCache = new Map<string, any>();
function createClient(appId: string, appSecret: string, domain?: FeishuDomain): any {
  const k = `${appId}:${appSecret}:${domain ?? "feishu"}`;
  if (clientCache.has(k)) return clientCache.get(k);
  let d: any;
  if (domain === "lark") d = Lark.Domain.Lark;
  else if (domain === "feishu" || !domain) d = Lark.Domain.Feishu;
  else d = domain.replace(/\/+$/, "");
  const c = new Lark.Client({ appId, appSecret, appType: Lark.AppType.SelfBuild, domain: d });
  clientCache.set(k, c);
  return c;
}

function resolveCredentials(config: any) {
  const f = config?.channels?.feishu;
  if (!f) return null;
  if (f.accounts && typeof f.accounts === "object") {
    for (const a of Object.values(f.accounts) as any[]) {
      const id = (a.appId ?? f.appId)?.trim(), sec = (a.appSecret ?? f.appSecret)?.trim();
      if (id && sec) return { appId: id, appSecret: sec, domain: a.domain ?? f.domain };
    }
  }
  if (f.appId?.trim() && f.appSecret?.trim()) return { appId: f.appId.trim(), appSecret: f.appSecret.trim(), domain: f.domain };
  return null;
}

// ============ Functions ============

async function grantPermission(client: any, p: any) {
  const res = await client.drive.permissionMember.create({ path: { token: p.token }, params: { type: p.type, need_notification: true }, data: { member_type: p.member_type, member_id: p.member_id, perm: p.perm } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { success: true, member: res.data?.member };
}

async function listPermissions(client: any, p: any) {
  const res = await client.drive.permissionMember.list({ path: { token: p.token }, params: { type: p.type } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { members: res.data?.items ?? [] };
}

async function revokePermission(client: any, p: any) {
  const res = await client.drive.permissionMember.delete({ path: { token: p.token, member_id: p.member_id }, params: { type: p.type, member_type: p.member_type } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { success: true, removed: p.member_id };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "grant": return grantPermission(client, p);
    case "list": return listPermissions(client, p);
    case "revoke": return revokePermission(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: grant, list, revoke`);
  }
}

const DESCRIPTION = `Feishu Permission operations. Pass "action" and "params".
Actions:
• grant: {token, type, member_type, member_id, perm} — Grant permission. type: doc|docx|sheet|bitable|file|wiki|folder|mindnote|minutes|slides. member_type: openid|email|userid|unionid|openchat|opendepartmentid|groupid. perm: view|edit|full_access
• list: {token, type} — List all collaborators on a document
• revoke: {token, type, member_type, member_id} — Remove collaborator permission`;

const plugin = {
  id: "feishu-permission",
  name: "Feishu Permission",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-permission: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_permission", label: "Feishu Permission", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_permission" });
    api.logger.info?.("feishu-permission: Registered 1 dispatcher tool (3 actions)");
  },
};

export default plugin;
