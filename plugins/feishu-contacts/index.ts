/**
 * Feishu Contacts plugin for OpenClaw — single dispatcher tool.
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

async function lookupUsers(client: any, p: any) {
  if (!p.emails?.length && !p.mobiles?.length) throw new Error("Provide at least one email or mobile");
  const res = await client.contact.user.batchGetId({ params: { user_id_type: "open_id" }, data: { emails: p.emails ?? [], mobiles: p.mobiles ?? [] } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { user_list: res.data?.user_list ?? [] };
}

async function getUser(client: any, p: any) {
  const res = await client.contact.user.get({ path: { user_id: p.open_id }, params: { user_id_type: "open_id" } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  const u = res.data?.user;
  if (!u) throw new Error("User not found");
  return { open_id: u.open_id, name: u.name, en_name: u.en_name, email: u.email, mobile: u.mobile, avatar: u.avatar?.avatar_72, department_ids: u.department_ids, job_title: u.job_title, status: u.status };
}

async function searchUsers(client: any, p: any) {
  const res = await client.search.user({ params: { user_id_type: "open_id", page_size: p.page_size ?? 20, ...(p.page_token && { page_token: p.page_token }) }, data: { query: p.query } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { users: (res.data?.items ?? []).map((u: any) => ({ open_id: u.open_id, name: u.name, en_name: u.en_name, department: u.department?.name, avatar: u.avatar?.avatar_72 })), has_more: res.data?.has_more ?? false, page_token: res.data?.page_token };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "lookup": return lookupUsers(client, p);
    case "get_user": return getUser(client, p);
    case "search": return searchUsers(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: lookup, get_user, search`);
  }
}

const DESCRIPTION = `Feishu Contacts operations. Pass "action" and "params".
Actions:
• lookup: {emails?, mobiles?} — Find user open_id by email or phone (max 50 each). Use before granting permissions or assigning tasks
• get_user: {open_id} — Get user profile (name, email, department, job title)
• search: {query, page_size?, page_token?} — Search company directory by name/keyword`;

const plugin = {
  id: "feishu-contacts",
  name: "Feishu Contacts",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-contacts: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_contacts", label: "Feishu Contacts", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_contacts" });
    api.logger.info?.("feishu-contacts: Registered 1 dispatcher tool (3 actions)");
  },
};

export default plugin;
