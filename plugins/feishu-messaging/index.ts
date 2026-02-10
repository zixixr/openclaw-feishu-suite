/**
 * Feishu Messaging plugin for OpenClaw — single dispatcher tool.
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

async function sendMessage(client: any, p: any) {
  const res = await client.im.message.create({ params: { receive_id_type: p.receive_id_type }, data: { receive_id: p.receive_id, msg_type: p.msg_type, content: p.content } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { message_id: res.data?.message_id, sent: true };
}

async function sendCard(client: any, p: any) {
  const res = await client.im.message.create({ params: { receive_id_type: p.receive_id_type }, data: { receive_id: p.receive_id, msg_type: "interactive", content: p.card_content } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { message_id: res.data?.message_id, sent: true };
}

async function replyMessage(client: any, p: any) {
  const res = await client.im.message.reply({ path: { message_id: p.message_id }, data: { msg_type: p.msg_type, content: p.content } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { message_id: res.data?.message_id, sent: true };
}

async function listChats(client: any, p: any) {
  const res = await client.im.chat.list({ params: { page_size: p.page_size ?? 20, ...(p.page_token && { page_token: p.page_token }) } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { chats: (res.data?.items ?? []).map((c: any) => ({ chat_id: c.chat_id, name: c.name, description: c.description, owner_id: c.owner_id, chat_type: c.chat_type })), has_more: res.data?.has_more ?? false, page_token: res.data?.page_token };
}

async function chatMembers(client: any, p: any) {
  const res = await client.im.chatMembers.get({ path: { chat_id: p.chat_id }, params: { member_id_type: "open_id", page_size: p.page_size ?? 20, ...(p.page_token && { page_token: p.page_token }) } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { members: (res.data?.items ?? []).map((m: any) => ({ member_id: m.member_id, name: m.name, member_id_type: m.member_id_type })), has_more: res.data?.has_more ?? false, page_token: res.data?.page_token };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "send": return sendMessage(client, p);
    case "send_card": return sendCard(client, p);
    case "reply": return replyMessage(client, p);
    case "list_chats": return listChats(client, p);
    case "chat_members": return chatMembers(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: send, send_card, reply, list_chats, chat_members`);
  }
}

const DESCRIPTION = `Feishu Messaging operations. Pass "action" and "params".
Actions:
• send: {receive_id, receive_id_type, msg_type, content} — Send text/post message. receive_id_type: open_id|chat_id|email. msg_type: text|post. content: JSON string e.g. {"text":"Hello"}
• send_card: {receive_id, receive_id_type, card_content} — Send interactive card. card_content: JSON string with elements/header
• reply: {message_id, msg_type, content} — Reply to a message (creates thread)
• list_chats: {page_size?, page_token?} — List bot's group chats
• chat_members: {chat_id, page_size?, page_token?} — List group members`;

const plugin = {
  id: "feishu-messaging",
  name: "Feishu Messaging",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-messaging: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_messaging", label: "Feishu Messaging", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_messaging" });
    api.logger.info?.("feishu-messaging: Registered 1 dispatcher tool (5 actions)");
  },
};

export default plugin;
