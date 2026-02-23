/**
 * Standalone Feishu Bitable plugin for OpenClaw.
 * Single dispatcher tool: feishu_bitable
 *
 * Dependencies resolved from the app's node_modules via createRequire.
 */
import { createRequire } from "node:module";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

declare const Buffer: {
  from(data: string, encoding?: string): any;
  from(data: ArrayBuffer | Uint8Array): any;
  isBuffer(obj: any): boolean;
  concat(list: any[]): any;
};

const appRequire = createRequire("/app/package.json");
const Lark = appRequire("@larksuiteoapi/node-sdk");
const { Type } = appRequire("@sinclair/typebox");

// ============ Types & Helpers ============

type FeishuDomain = "feishu" | "lark" | (string & {});

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

const FIELD_TYPE_NAMES: Record<number, string> = {
  1: "Text", 2: "Number", 3: "SingleSelect", 4: "MultiSelect", 5: "DateTime",
  7: "Checkbox", 11: "User", 13: "Phone", 15: "URL", 17: "Attachment",
  18: "SingleLink", 19: "Lookup", 20: "Formula", 21: "DuplexLink",
  22: "Location", 23: "GroupChat",
  1001: "CreatedTime", 1002: "ModifiedTime", 1003: "CreatedUser",
  1004: "ModifiedUser", 1005: "AutoNumber",
};

const clientCache = new Map<string, any>();

function createClient(appId: string, appSecret: string, domain?: FeishuDomain): any {
  const cacheKey = `${appId}:${appSecret}:${domain ?? "feishu"}`;
  if (clientCache.has(cacheKey)) return clientCache.get(cacheKey);
  let resolvedDomain: any;
  if (domain === "lark") resolvedDomain = Lark.Domain.Lark;
  else if (domain === "feishu" || !domain) resolvedDomain = Lark.Domain.Feishu;
  else resolvedDomain = domain.replace(/\/+$/, "");
  const client = new Lark.Client({ appId, appSecret, appType: Lark.AppType.SelfBuild, domain: resolvedDomain });
  clientCache.set(cacheKey, client);
  return client;
}

function resolveCredentials(config: any) {
  const feishu = config?.channels?.feishu as any;
  if (!feishu) return null;
  if (feishu.accounts && typeof feishu.accounts === "object") {
    for (const account of Object.values(feishu.accounts)) {
      const a = account as any;
      const appId = (a.appId ?? feishu.appId)?.trim();
      const appSecret = (a.appSecret ?? feishu.appSecret)?.trim();
      if (appId && appSecret) return { appId, appSecret, domain: a.domain ?? feishu.domain, toolsConfig: a.tools ?? feishu.tools };
    }
  }
  if (feishu.appId?.trim() && feishu.appSecret?.trim()) {
    return { appId: feishu.appId.trim(), appSecret: feishu.appSecret.trim(), domain: feishu.domain, toolsConfig: feishu.tools };
  }
  return null;
}

// ============ Core Functions ============

function parseBitableUrl(url: string): { token: string; tableId?: string; isWiki: boolean } | null {
  try {
    const u = new URL(url);
    const tableId = u.searchParams.get("table") ?? undefined;
    const wikiMatch = u.pathname.match(/\/wiki\/([A-Za-z0-9]+)/);
    if (wikiMatch) return { token: wikiMatch[1], tableId, isWiki: true };
    const baseMatch = u.pathname.match(/\/base\/([A-Za-z0-9]+)/);
    if (baseMatch) return { token: baseMatch[1], tableId, isWiki: false };
    return null;
  } catch { return null; }
}

async function getAppTokenFromWiki(client: any, nodeToken: string): Promise<string> {
  const res = await client.wiki.space.getNode({ params: { token: nodeToken } });
  if (res.code !== 0) throw new Error(res.msg);
  const node = res.data?.node;
  if (!node) throw new Error("Node not found");
  if (node.obj_type !== "bitable") throw new Error(`Node is not a bitable (type: ${node.obj_type})`);
  return node.obj_token!;
}

async function getBitableMeta(client: any, url: string) {
  const parsed = parseBitableUrl(url);
  if (!parsed) throw new Error("Invalid URL format. Expected /base/XXX or /wiki/XXX URL");
  let appToken: string;
  if (parsed.isWiki) appToken = await getAppTokenFromWiki(client, parsed.token);
  else appToken = parsed.token;
  const res = await client.bitable.app.get({ path: { app_token: appToken } });
  if (res.code !== 0) throw new Error(res.msg);
  let tables: { table_id: string; name: string }[] = [];
  if (!parsed.tableId) {
    const tablesRes = await client.bitable.appTable.list({ path: { app_token: appToken } });
    if (tablesRes.code === 0) tables = (tablesRes.data?.items ?? []).map((t: any) => ({ table_id: t.table_id!, name: t.name! }));
  }
  return {
    app_token: appToken, table_id: parsed.tableId, name: res.data?.app?.name,
    url_type: parsed.isWiki ? "wiki" : "base",
    ...(tables.length > 0 && { tables }),
    hint: parsed.tableId
      ? `Use app_token="${appToken}" and table_id="${parsed.tableId}" for other actions`
      : `Use app_token="${appToken}". Select a table_id from the tables list.`,
  };
}

async function listFields(client: any, appToken: string, tableId: string) {
  const res = await client.bitable.appTableField.list({ path: { app_token: appToken, table_id: tableId } });
  if (res.code !== 0) throw new Error(res.msg);
  const fields = res.data?.items ?? [];
  return {
    fields: fields.map((f: any) => ({
      field_id: f.field_id, field_name: f.field_name, type: f.type,
      type_name: FIELD_TYPE_NAMES[f.type ?? 0] || `type_${f.type}`,
      is_primary: f.is_primary, ...(f.property && { property: f.property }),
    })),
    total: fields.length,
  };
}

async function listRecords(client: any, appToken: string, tableId: string, pageSize?: number, pageToken?: string) {
  const res = await client.bitable.appTableRecord.list({
    path: { app_token: appToken, table_id: tableId },
    params: { page_size: pageSize ?? 100, ...(pageToken && { page_token: pageToken }) },
  });
  if (res.code !== 0) throw new Error(res.msg);
  return { records: res.data?.items ?? [], has_more: res.data?.has_more ?? false, page_token: res.data?.page_token, total: res.data?.total };
}

async function searchRecords(client: any, appToken: string, tableId: string, filter?: unknown, sort?: unknown, fieldNames?: string[], pageSize?: number, pageToken?: string) {
  const res = await client.bitable.appTableRecord.search({
    path: { app_token: appToken, table_id: tableId },
    data: { ...(filter && { filter }), ...(sort && { sort }), ...(fieldNames && { field_names: fieldNames }), page_size: pageSize ?? 100, ...(pageToken && { page_token: pageToken }) },
  });
  if (res.code !== 0) throw new Error(res.msg);
  return { records: res.data?.items ?? [], has_more: res.data?.has_more ?? false, page_token: res.data?.page_token, total: res.data?.total };
}

async function createRecord(client: any, appToken: string, tableId: string, fields: Record<string, unknown>) {
  const res = await client.bitable.appTableRecord.create({ path: { app_token: appToken, table_id: tableId }, data: { fields } });
  if (res.code !== 0) throw new Error(res.msg);
  return { record: res.data?.record };
}

async function updateRecord(client: any, appToken: string, tableId: string, recordId: string, fields: Record<string, unknown>) {
  const res = await client.bitable.appTableRecord.update({ path: { app_token: appToken, table_id: tableId, record_id: recordId }, data: { fields } });
  if (res.code !== 0) throw new Error(res.msg);
  return { record: res.data?.record };
}

async function deleteRecord(client: any, appToken: string, tableId: string, recordId: string) {
  const res = await client.bitable.appTableRecord.delete({ path: { app_token: appToken, table_id: tableId, record_id: recordId } });
  if (res.code !== 0) throw new Error(res.msg);
  return { deleted: true, record_id: recordId };
}

async function batchCreateRecords(client: any, appToken: string, tableId: string, records: Array<{ fields: Record<string, unknown> }>) {
  const res = await client.bitable.appTableRecord.batchCreate({ path: { app_token: appToken, table_id: tableId }, data: { records } });
  if (res.code !== 0) throw new Error(res.msg);
  return { records: res.data?.records ?? [] };
}

async function batchUpdateRecords(client: any, appToken: string, tableId: string, records: Array<{ record_id: string; fields: Record<string, unknown> }>) {
  const res = await client.bitable.appTableRecord.batchUpdate({ path: { app_token: appToken, table_id: tableId }, data: { records } });
  if (res.code !== 0) throw new Error(res.msg);
  return { records: res.data?.records ?? [] };
}

async function batchDeleteRecords(client: any, appToken: string, tableId: string, recordIds: string[]) {
  const res = await client.bitable.appTableRecord.batchDelete({ path: { app_token: appToken, table_id: tableId }, data: { records: recordIds } });
  if (res.code !== 0) throw new Error(res.msg);
  return { deleted: true, count: recordIds.length };
}

async function createField(client: any, appToken: string, tableId: string, fieldName: string, type: number, property?: Record<string, unknown>) {
  const res = await client.bitable.appTableField.create({ path: { app_token: appToken, table_id: tableId }, data: { field_name: fieldName, type, ...(property && { property }) } });
  if (res.code !== 0) throw new Error(res.msg);
  return { field: res.data?.field };
}

async function updateField(client: any, appToken: string, tableId: string, fieldId: string, fieldName?: string, property?: Record<string, unknown>) {
  const res = await client.bitable.appTableField.update({ path: { app_token: appToken, table_id: tableId, field_id: fieldId }, data: { ...(fieldName && { field_name: fieldName }), ...(property && { property }) } });
  if (res.code !== 0) throw new Error(res.msg);
  return { field: res.data?.field };
}

async function deleteField(client: any, appToken: string, tableId: string, fieldId: string) {
  const res = await client.bitable.appTableField.delete({ path: { app_token: appToken, table_id: tableId, field_id: fieldId } });
  if (res.code !== 0) throw new Error(res.msg);
  return { deleted: true, field_id: fieldId };
}

async function listViews(client: any, appToken: string, tableId: string) {
  const res = await client.bitable.appTableView.list({ path: { app_token: appToken, table_id: tableId } });
  if (res.code !== 0) throw new Error(res.msg);
  return { views: (res.data?.items ?? []).map((v: any) => ({ view_id: v.view_id, view_name: v.view_name, view_type: v.view_type })), total: res.data?.items?.length ?? 0 };
}

async function createView(client: any, appToken: string, tableId: string, viewName: string, viewType?: string) {
  const res = await client.bitable.appTableView.create({ path: { app_token: appToken, table_id: tableId }, data: { view_name: viewName, ...(viewType && { view_type: viewType }) } });
  if (res.code !== 0) throw new Error(res.msg);
  return { view: res.data?.view };
}

async function updateView(client: any, appToken: string, tableId: string, viewId: string, viewName?: string, property?: Record<string, unknown>) {
  const res = await client.bitable.appTableView.patch({ path: { app_token: appToken, table_id: tableId, view_id: viewId }, data: { ...(viewName && { view_name: viewName }), ...(property && { property }) } });
  if (res.code !== 0) throw new Error(res.msg);
  return { view: res.data?.view };
}

async function deleteView(client: any, appToken: string, tableId: string, viewId: string) {
  const res = await client.bitable.appTableView.delete({ path: { app_token: appToken, table_id: tableId, view_id: viewId } });
  if (res.code !== 0) throw new Error(res.msg);
  return { deleted: true, view_id: viewId };
}

async function createApp(client: any, name: string, folderToken?: string) {
  const res = await client.bitable.app.create({ data: { name, ...(folderToken && { folder_token: folderToken }) } });
  if (res.code !== 0) throw new Error(res.msg);
  const app = res.data?.app;
  return { app_token: app?.app_token, name: app?.name, url: app?.url };
}

async function createTable(client: any, appToken: string, name: string, fields?: Array<{ field_name: string; type: number; property?: Record<string, unknown> }>, defaultViewName?: string) {
  const table: Record<string, unknown> = { name };
  if (defaultViewName) table.default_view_name = defaultViewName;
  if (fields && fields.length > 0) table.fields = fields;
  const res = await client.bitable.appTable.create({ path: { app_token: appToken }, data: { table } });
  if (res.code !== 0) throw new Error(res.msg);
  return { table_id: res.data?.table_id, name };
}

async function listTables(client: any, appToken: string, pageSize?: number, pageToken?: string) {
  const res = await client.bitable.appTable.list({ path: { app_token: appToken }, params: { ...(pageSize && { page_size: pageSize }), ...(pageToken && { page_token: pageToken }) } });
  if (res.code !== 0) throw new Error(res.msg);
  return { tables: (res.data?.items ?? []).map((t: any) => ({ table_id: t.table_id, name: t.name, revision: t.revision })), total: res.data?.items?.length ?? 0, has_more: res.data?.has_more ?? false, page_token: res.data?.page_token };
}

// ============ Field Value & Media Helpers ============

function fieldToString(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((seg: any) => (typeof seg === "object" && seg?.text != null) ? seg.text : String(seg)).join("").trim();
  return String(value);
}

async function downloadToBuffer(client: any, fileToken: string): Promise<any> {
  const res = await client.drive.media.download({ path: { file_token: fileToken } });
  const stream = res.getReadableStream();
  const chunks: any[] = [];
  await new Promise<void>((resolve, reject) => { stream.on("data", (chunk: any) => chunks.push(chunk)); stream.on("end", resolve); stream.on("error", reject); });
  return Buffer.concat(chunks);
}

async function uploadFromBuffer(client: any, appToken: string, fileName: string, buffer: any): Promise<string> {
  const res = await client.drive.media.uploadAll({ data: { file_name: fileName, parent_type: "bitable_file", parent_node: appToken, size: buffer.length, file: buffer } });
  if (res.code !== undefined && res.code !== 0) throw new Error(res.msg);
  const token = res.data?.file_token ?? res.file_token;
  if (!token) throw new Error("Upload succeeded but no file_token returned");
  return token;
}

async function uploadAttachment(client: any, appToken: string, tableId: string, recordId: string, fieldName: string, filePath: string, fileName?: string): Promise<any> {
  const fs = appRequire("fs");
  const path = appRequire("path");
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const name = fileName || path.basename(filePath);
  const fileToken = await uploadFromBuffer(client, appToken, name, buffer);
  // Get existing attachments to append (not overwrite)
  const recRes = await client.bitable.appTableRecord.get({ path: { app_token: appToken, table_id: tableId, record_id: recordId } });
  const existing: any[] = (recRes.code === 0 && Array.isArray(recRes.data?.record?.fields?.[fieldName])) ? recRes.data.record.fields[fieldName] : [];
  const newAttachments = [...existing, { file_token: fileToken }];
  const updateRes = await client.bitable.appTableRecord.update({ path: { app_token: appToken, table_id: tableId, record_id: recordId }, data: { fields: { [fieldName]: newAttachments } } });
  if (updateRes.code !== 0) throw new Error(updateRes.msg);
  return { uploaded: true, file_token: fileToken, file_name: name, record_id: recordId, field_name: fieldName, total_attachments: newAttachments.length };
}

async function batchCopyAttachments(client: any, srcAppToken: string, srcTableId: string, dstAppToken: string, dstTableId: string, fieldName: string, matchField?: string) {
  const srcFieldsRes = await client.bitable.appTableField.list({ path: { app_token: srcAppToken, table_id: srcTableId } });
  if (srcFieldsRes.code !== 0) throw new Error(`List source fields: ${srcFieldsRes.msg}`);
  const attachField = (srcFieldsRes.data?.items ?? []).find((f: any) => f.field_name === fieldName);
  if (!attachField) throw new Error(`Attachment field "${fieldName}" not found`);
  if (attachField.type !== 17) throw new Error(`Field "${fieldName}" is not attachment type`);

  let matchFieldName = matchField;
  if (!matchFieldName) {
    const primaryField = (srcFieldsRes.data?.items ?? []).find((f: any) => f.is_primary);
    if (!primaryField) throw new Error("Cannot find primary field");
    matchFieldName = primaryField.field_name;
  }

  const srcRecords: any[] = [];
  let pt: string | undefined;
  do {
    const res = await client.bitable.appTableRecord.list({ path: { app_token: srcAppToken, table_id: srcTableId }, params: { page_size: 500, ...(pt && { page_token: pt }) } });
    if (res.code !== 0) throw new Error(`List source: ${res.msg}`);
    srcRecords.push(...(res.data?.items ?? []));
    pt = res.data?.has_more ? res.data.page_token : undefined;
  } while (pt);

  const withAttach = srcRecords.filter((r: any) => { const v = r.fields?.[fieldName]; return Array.isArray(v) && v.length > 0; });
  if (withAttach.length === 0) return { copied: 0, message: `No attachments in "${fieldName}"` };

  const dstRecords: any[] = [];
  let dpt: string | undefined;
  do {
    const res: any = await client.bitable.appTableRecord.list({ path: { app_token: dstAppToken, table_id: dstTableId }, params: { page_size: 500, ...(dpt && { page_token: dpt }) } });
    if (res.code !== 0) throw new Error(`List dest: ${res.msg}`);
    dstRecords.push(...(res.data?.items ?? []));
    dpt = res.data?.has_more ? res.data.page_token : undefined;
  } while (dpt);

  const dstLookup = new Map<string, string>();
  for (const r of dstRecords) { const key = fieldToString(r.fields?.[matchFieldName!]); if (key) dstLookup.set(key, r.record_id); }

  let copied = 0, skipped = 0;
  const errors: string[] = [];
  for (const srcRec of withAttach) {
    const matchVal = fieldToString(srcRec.fields?.[matchFieldName!]);
    const dstRecordId = dstLookup.get(matchVal);
    if (!dstRecordId) { skipped++; continue; }
    const attachments: any[] = srcRec.fields[fieldName];
    const newTokens: any[] = [];
    for (const att of attachments) {
      try {
        const buffer = await downloadToBuffer(client, att.file_token);
        const newToken = await uploadFromBuffer(client, dstAppToken, att.name || "file", buffer);
        newTokens.push({ file_token: newToken });
      } catch (err) { errors.push(`${matchVal}/${att.name}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    if (newTokens.length > 0) {
      const updateRes = await client.bitable.appTableRecord.update({ path: { app_token: dstAppToken, table_id: dstTableId, record_id: dstRecordId }, data: { fields: { [fieldName]: newTokens } } });
      if (updateRes.code !== 0) errors.push(`Update ${matchVal}: ${updateRes.msg}`);
      else copied++;
    }
  }
  return { copied, skipped, total_source: withAttach.length, match_field: matchFieldName, attachment_field: fieldName, ...(errors.length > 0 && { errors }) };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "get_meta": return getBitableMeta(client, p.url);
    case "list_records": return listRecords(client, p.app_token, p.table_id, p.page_size, p.page_token);
    case "search": return searchRecords(client, p.app_token, p.table_id, p.filter, p.sort, p.field_names, p.page_size, p.page_token);
    case "create_record": return createRecord(client, p.app_token, p.table_id, p.fields);
    case "update_record": return updateRecord(client, p.app_token, p.table_id, p.record_id, p.fields);
    case "delete_record": return deleteRecord(client, p.app_token, p.table_id, p.record_id);
    case "batch_create": return batchCreateRecords(client, p.app_token, p.table_id, p.records);
    case "batch_update": return batchUpdateRecords(client, p.app_token, p.table_id, p.records);
    case "batch_delete": return batchDeleteRecords(client, p.app_token, p.table_id, p.record_ids ?? p.records);
    case "list_fields": return listFields(client, p.app_token, p.table_id);
    case "create_field": return createField(client, p.app_token, p.table_id, p.field_name, p.type, p.property);
    case "update_field": return updateField(client, p.app_token, p.table_id, p.field_id, p.field_name, p.property);
    case "delete_field": return deleteField(client, p.app_token, p.table_id, p.field_id);
    case "list_views": return listViews(client, p.app_token, p.table_id);
    case "create_view": return createView(client, p.app_token, p.table_id, p.view_name, p.view_type);
    case "update_view": return updateView(client, p.app_token, p.table_id, p.view_id, p.view_name, p.property);
    case "delete_view": return deleteView(client, p.app_token, p.table_id, p.view_id);
    case "create_app": return createApp(client, p.name, p.folder_token);
    case "create_table": return createTable(client, p.app_token, p.name, p.fields, p.default_view_name);
    case "list_tables": return listTables(client, p.app_token, p.page_size, p.page_token);
    case "copy_attachments": return batchCopyAttachments(client, p.src_app_token, p.src_table_id, p.dst_app_token, p.dst_table_id, p.field_name, p.match_field);
    case "upload_attachment": return uploadAttachment(client, p.app_token, p.table_id, p.record_id, p.field_name, p.file_path, p.file_name);
    default: throw new Error(`Unknown action: ${action}. Valid: get_meta, list_records, search, create_record, update_record, delete_record, batch_create, batch_update, batch_delete, list_fields, create_field, update_field, delete_field, list_views, create_view, update_view, delete_view, create_app, create_table, list_tables, copy_attachments, upload_attachment`);
  }
}

// ============ Plugin ============

const DESCRIPTION = `Feishu Bitable operations. Pass "action" and "params".
Actions:
• get_meta: {url} — Parse bitable URL → app_token, table_id, table list
• list_records: {app_token, table_id, page_size?, page_token?}
• search: {app_token, table_id, filter?, sort?, field_names?, page_size?, page_token?} — filter: {conjunction:"and"|"or", conditions:[{field_name,operator,value}]}
• create_record: {app_token, table_id, fields} — fields: {field_name: value}
• update_record: {app_token, table_id, record_id, fields}
• delete_record: {app_token, table_id, record_id}
• batch_create: {app_token, table_id, records} — records: [{fields:{...}}]
• batch_update: {app_token, table_id, records} — records: [{record_id, fields:{...}}]
• batch_delete: {app_token, table_id, record_ids} — record_ids: [id,...]
• list_fields: {app_token, table_id}
• create_field: {app_token, table_id, field_name, type, property?} — type: 1=Text,2=Number,3=SingleSelect,4=MultiSelect,5=DateTime,7=Checkbox,11=User,13=Phone,15=URL,17=Attachment
• update_field: {app_token, table_id, field_id, field_name?, property?}
• delete_field: {app_token, table_id, field_id}
• list_views: {app_token, table_id}
• create_view: {app_token, table_id, view_name, view_type?} — type: grid|kanban|gallery|gantt|form
• update_view: {app_token, table_id, view_id, view_name?, property?}
• delete_view: {app_token, table_id, view_id}
• create_app: {name, folder_token?} — Create new bitable
• create_table: {app_token, name, fields?, default_view_name?}
• list_tables: {app_token, page_size?, page_token?}
• copy_attachments: {src_app_token, src_table_id, dst_app_token, dst_table_id, field_name, match_field?} — Copy attachments between tables
• upload_attachment: {app_token, table_id, record_id, field_name, file_path, file_name?} — Upload a local file (e.g. from MediaPath) to a record's attachment field`;

const plugin = {
  id: "feishu-bitable",
  name: "Feishu Bitable Enhanced",

  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-bitable: No credentials, skipping"); return; }
    if (creds.toolsConfig?.bitable === false) { api.logger.debug?.("feishu-bitable: disabled in config"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);

    api.registerTool({
      name: "feishu_bitable",
      label: "Feishu Bitable",
      description: DESCRIPTION,
      parameters: Type.Object({
        action: Type.String({ description: "Action name (see tool description)" }),
        params: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Parameters for the action" })),
      }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_bitable" });

    api.logger.info?.("feishu-bitable: Registered 1 dispatcher tool (21 actions)");
  },
};

export default plugin;
