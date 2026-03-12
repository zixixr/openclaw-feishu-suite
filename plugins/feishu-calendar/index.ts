/**
 * Feishu Calendar plugin for OpenClaw — single dispatcher tool.
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

// ============ Helpers ============

async function resolvePrimaryCalendarId(client: any): Promise<string> {
  const res = await client.calendar.calendar.list({ params: { page_size: 50 } });
  if (res.code !== 0) throw new Error(`Cannot list calendars: ${res.msg} (${res.code})`);
  const list = res.data?.calendar_list ?? [];
  // Prefer "primary" type, then "owner" role, then first available
  const primary = list.find((c: any) => c.type === "primary");
  if (primary) return primary.calendar_id;
  const owned = list.find((c: any) => c.role === "owner");
  if (owned) return owned.calendar_id;
  if (list[0]) return list[0].calendar_id;
  throw new Error("No calendars found for this app. The app may need calendar:calendar:readonly scope.");
}

async function ensureCalendarId(client: any, calendarId?: string): Promise<string> {
  if (calendarId && calendarId !== "primary") return calendarId;
  return resolvePrimaryCalendarId(client);
}

// ============ Functions ============

async function listCalendars(client: any, p: any) {
  const res = await client.calendar.calendar.list({ params: { page_size: p.page_size ?? 50, ...(p.page_token && { page_token: p.page_token }) } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { calendars: (res.data?.calendar_list ?? []).map((c: any) => ({ calendar_id: c.calendar_id, summary: c.summary, description: c.description, type: c.type, role: c.role })), has_more: res.data?.has_more ?? false, page_token: res.data?.page_token };
}

async function listEvents(client: any, p: any) {
  const calId = await ensureCalendarId(client, p.calendar_id);
  const res = await client.calendar.calendarEvent.list({ path: { calendar_id: calId }, params: { start_time: p.start_time, end_time: p.end_time, page_size: p.page_size ?? 50, ...(p.page_token && { page_token: p.page_token }) } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { events: (res.data?.items ?? []).map((e: any) => ({ event_id: e.event_id, summary: e.summary, description: e.description, start_time: e.start_time, end_time: e.end_time, status: e.status, location: e.location?.name, organizer: e.organizer })), has_more: res.data?.has_more ?? false, page_token: res.data?.page_token };
}

async function getEvent(client: any, p: any) {
  const calId = await ensureCalendarId(client, p.calendar_id);
  const res = await client.calendar.calendarEvent.get({ path: { calendar_id: calId, event_id: p.event_id } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { event: res.data?.event };
}

async function createEvent(client: any, p: any) {
  const calId = await ensureCalendarId(client, p.calendar_id);
  const st = p.is_all_day ? { date: p.start_time } : { timestamp: p.start_time };
  const et = p.is_all_day ? { date: p.end_time } : { timestamp: p.end_time };
  const data: any = { summary: p.summary, start_time: st, end_time: et, free_busy_status: "busy", attendee_ability: "can_see_others" };
  if (p.description) data.description = p.description;
  if (p.location) data.location = { name: p.location };
  if (p.reminders?.length) data.reminders = p.reminders.map((m: number) => ({ minutes: m }));
  const res = await client.calendar.calendarEvent.create({ path: { calendar_id: calId }, data });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  const event = res.data?.event;
  if (p.attendee_open_ids?.length && event?.event_id) {
    const aRes = await client.calendar.calendarEventAttendee.create({ path: { calendar_id: calId, event_id: event.event_id }, params: { user_id_type: "open_id" }, data: { attendees: p.attendee_open_ids.map((id: string) => ({ type: "user", user_id: id })) } });
    if (aRes.code !== 0) return { event, attendee_warning: `Event created but attendees failed: ${aRes.msg}` };
  }
  return { event, attendees_added: p.attendee_open_ids?.length ?? 0 };
}

async function updateEvent(client: any, p: any) {
  const calId = await ensureCalendarId(client, p.calendar_id);
  const data: any = {};
  if (p.summary) data.summary = p.summary;
  if (p.description) data.description = p.description;
  if (p.start_time) data.start_time = { timestamp: p.start_time };
  if (p.end_time) data.end_time = { timestamp: p.end_time };
  if (p.location) data.location = { name: p.location };
  const res = await client.calendar.calendarEvent.patch({ path: { calendar_id: calId, event_id: p.event_id }, data });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { event: res.data?.event };
}

async function deleteEvent(client: any, p: any) {
  const calId = await ensureCalendarId(client, p.calendar_id);
  const res = await client.calendar.calendarEvent.delete({ path: { calendar_id: calId, event_id: p.event_id } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { deleted: true, event_id: p.event_id };
}

async function freeBusy(client: any, p: any) {
  const res = await client.calendar.freebusy.list({ data: { time_min: p.time_min, time_max: p.time_max, user_id: { user_id: p.user_open_id, type: "open_id" } } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { freebusy_list: res.data?.freebusy_list ?? [] };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "list_calendars": return listCalendars(client, p);
    case "list_events": return listEvents(client, p);
    case "get_event": return getEvent(client, p);
    case "create_event": return createEvent(client, p);
    case "update_event": return updateEvent(client, p);
    case "delete_event": return deleteEvent(client, p);
    case "freebusy": return freeBusy(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: list_calendars, list_events, get_event, create_event, update_event, delete_event, freebusy`);
  }
}

const DESCRIPTION = `Feishu Calendar operations. Pass "action" and "params".
IMPORTANT: Events are created on the bot's calendar. You MUST pass attendee_open_ids with the user's open_id so the event appears on their calendar.
Actions:
• list_calendars: {page_size?, page_token?}
• list_events: {calendar_id?, start_time, end_time, page_size?, page_token?} — times are Unix seconds
• get_event: {calendar_id?, event_id}
• create_event: {summary, start_time, end_time, attendee_open_ids, description?, is_all_day?, location?, reminders?} — MUST include attendee_open_ids with the requesting user's open_id. Times are Unix seconds. Reminders are minutes before event (e.g. [15])
• update_event: {event_id, summary?, description?, start_time?, end_time?, location?, calendar_id?}
• delete_event: {event_id, calendar_id?}
• freebusy: {time_min, time_max, user_open_id} — Check user availability`;

const plugin = {
  id: "feishu-calendar",
  name: "Feishu Calendar",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-calendar: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_calendar", label: "Feishu Calendar", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_calendar" });
    api.logger.info?.("feishu-calendar: Registered 1 dispatcher tool (7 actions)");
  },
};

export default plugin;
