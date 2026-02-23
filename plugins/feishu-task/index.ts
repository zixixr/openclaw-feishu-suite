/**
 * Feishu Task plugin for OpenClaw — single dispatcher tool.
 * Uses Lark SDK v2 task API methods directly.
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

function sdkCheck(res: any) {
  if (res.code !== 0) throw new Error(`${res.msg} (code ${res.code})`);
  return res.data;
}

// ============ Helpers ============

/** Feishu Task v2 API expects timestamps in milliseconds. Auto-convert if seconds (10 digits) provided. */
function toMillis(ts: string | number): string {
  const n = typeof ts === "string" ? Number(ts) : ts;
  return String(n < 1e12 ? n * 1000 : n);
}

// ============ Functions (using SDK v2 methods) ============

async function createTask(client: any, p: any) {
  const data: any = { summary: p.summary };
  if (p.description) data.description = p.description;
  if (p.due_timestamp) data.due = { timestamp: toMillis(p.due_timestamp), is_all_day: p.is_all_day ?? false };
  if (p.assignee_open_ids?.length) data.members = p.assignee_open_ids.map((id: string) => ({ id, type: "user", role: "assignee" }));
  const res = await client.task.v2.task.create({ data, params: { user_id_type: "open_id" } });
  return { task: sdkCheck(res)?.task };
}

async function getTask(client: any, p: any) {
  const res = await client.task.v2.task.get({ path: { task_guid: p.task_guid }, params: { user_id_type: "open_id" } });
  return { task: sdkCheck(res)?.task };
}

async function listTasks(client: any, p: any) {
  const params: any = { page_size: p.page_size ?? 50, user_id_type: "open_id" };
  if (p.page_token) params.page_token = p.page_token;
  if (p.completed !== undefined) params.completed = String(p.completed);
  const res = await client.task.v2.task.list({ params });
  const d = sdkCheck(res);
  return { tasks: d?.items ?? [], has_more: d?.has_more ?? false, page_token: d?.page_token };
}

async function updateTask(client: any, p: any) {
  const data: any = {};
  const uf: string[] = [];
  if (p.summary !== undefined) { data.summary = p.summary; uf.push("summary"); }
  if (p.description !== undefined) { data.description = p.description; uf.push("description"); }
  if (p.due_timestamp !== undefined) { data.due = p.due_timestamp === "0" ? null : { timestamp: toMillis(p.due_timestamp), is_all_day: false }; uf.push("due"); }
  const res = await client.task.v2.task.patch({
    path: { task_guid: p.task_guid },
    data: { task: data, update_fields: uf },
    params: { user_id_type: "open_id" },
  });
  return { task: sdkCheck(res)?.task };
}

async function completeTask(client: any, p: any) {
  const res = await client.task.v2.task.patch({
    path: { task_guid: p.task_guid },
    data: { task: { completed_at: String(Date.now()) }, update_fields: ["completed_at"] },
    params: { user_id_type: "open_id" },
  });
  return { completed: true, task: sdkCheck(res)?.task };
}

async function addMember(client: any, p: any) {
  const members = (p.member_open_ids ?? []).map((id: string) => ({ id, type: "user", role: p.role ?? "assignee" }));
  const res = await client.task.v2.task.addMembers({
    path: { task_guid: p.task_guid },
    data: { members },
    params: { user_id_type: "open_id" },
  });
  return { task: sdkCheck(res)?.task };
}

async function removeMember(client: any, p: any) {
  const members = (p.member_open_ids ?? []).map((id: string) => ({ id, type: "user", role: p.role ?? "assignee" }));
  const res = await client.task.v2.task.removeMembers({
    path: { task_guid: p.task_guid },
    data: { members },
    params: { user_id_type: "open_id" },
  });
  return { task: sdkCheck(res)?.task };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "create": return createTask(client, p);
    case "get": return getTask(client, p);
    case "list": return listTasks(client, p);
    case "update": return updateTask(client, p);
    case "complete": return completeTask(client, p);
    case "add_member": return addMember(client, p);
    case "remove_member": return removeMember(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: create, get, list, update, complete, add_member, remove_member`);
  }
}

const DESCRIPTION = `Feishu Task operations. Pass "action" and "params".
IMPORTANT: You MUST always include the requesting user's open_id in assignee_open_ids when creating tasks.
IMPORTANT: After creating a task, ALWAYS save the returned task_guid to memory/MEMORY.md so you can reference it later for complete/update.
Note: All actions except "create" use task_guid (the UUID returned from create), NOT the short task_id.
Actions:
• create: {summary, assignee_open_ids, description?, due_timestamp?, is_all_day?} — MUST include assignee_open_ids. due_timestamp in Unix seconds. SAVE the returned guid to memory!
• get: {task_guid}
• update: {task_guid, summary?, description?, due_timestamp?} — due_timestamp="0" removes due date
• complete: {task_guid} — Mark task as completed
• add_member: {task_guid, member_open_ids, role?} — role: "assignee"(default) or "follower"
• remove_member: {task_guid, member_open_ids, role?}`;

const plugin = {
  id: "feishu-task",
  name: "Feishu Task",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-task: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_task", label: "Feishu Task", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_task" });
    api.logger.info?.("feishu-task: Registered 1 dispatcher tool (7 actions)");
  },
};

export default plugin;
