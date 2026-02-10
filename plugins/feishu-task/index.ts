/**
 * Feishu Task plugin for OpenClaw — single dispatcher tool.
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

async function taskRequest(client: any, method: string, url: string, data?: any, params?: any) {
  const res = await client.request({ method, url: `/open-apis${url}`, data, params: { user_id_type: "open_id", ...params } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return res.data;
}

// ============ Functions ============

async function createTask(client: any, p: any) {
  const data: any = { summary: p.summary };
  if (p.description) data.description = p.description;
  if (p.due_timestamp) data.due = { timestamp: p.due_timestamp, is_all_day: p.is_all_day ?? false };
  if (p.assignee_open_ids?.length) data.members = p.assignee_open_ids.map((id: string) => ({ id, type: "user", role: "assignee" }));
  return { task: (await taskRequest(client, "POST", "/task/v2/tasks", data))?.task };
}

async function getTask(client: any, p: any) {
  return { task: (await taskRequest(client, "GET", `/task/v2/tasks/${p.task_id}`))?.task };
}

async function listTasks(client: any, p: any) {
  const qp: any = { page_size: p.page_size ?? 50, ...(p.page_token && { page_token: p.page_token }) };
  if (p.completed !== undefined) qp.completed = p.completed;
  const r = await taskRequest(client, "GET", "/task/v2/tasks", undefined, qp);
  return { tasks: r?.items ?? [], has_more: r?.has_more ?? false, page_token: r?.page_token };
}

async function updateTask(client: any, p: any) {
  const data: any = {};
  const uf: string[] = [];
  if (p.summary !== undefined) { data.summary = p.summary; uf.push("summary"); }
  if (p.description !== undefined) { data.description = p.description; uf.push("description"); }
  if (p.due_timestamp !== undefined) { data.due = p.due_timestamp === "0" ? null : { timestamp: p.due_timestamp, is_all_day: false }; uf.push("due"); }
  return { task: (await taskRequest(client, "PATCH", `/task/v2/tasks/${p.task_id}`, { task: data, update_fields: uf }))?.task };
}

async function completeTask(client: any, p: any) {
  const r = await taskRequest(client, "POST", `/task/v2/tasks/${p.task_id}/complete`);
  return { completed: true, task_id: p.task_id, task: r?.task };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "create": return createTask(client, p);
    case "get": return getTask(client, p);
    case "list": return listTasks(client, p);
    case "update": return updateTask(client, p);
    case "complete": return completeTask(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: create, get, list, update, complete`);
  }
}

const DESCRIPTION = `Feishu Task operations. Pass "action" and "params".
Actions:
• create: {summary, description?, due_timestamp?, is_all_day?, assignee_open_ids?} — Create task. due_timestamp in Unix seconds
• get: {task_id} — Get task details
• list: {page_size?, page_token?, completed?} — List tasks. completed: true=done, false=active
• update: {task_id, summary?, description?, due_timestamp?} — Update task. due_timestamp="0" removes due date
• complete: {task_id} — Mark task as completed`;

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
    api.logger.info?.("feishu-task: Registered 1 dispatcher tool (5 actions)");
  },
};

export default plugin;
