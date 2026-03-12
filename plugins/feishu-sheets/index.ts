/**
 * Feishu Sheets plugin for OpenClaw — single dispatcher tool.
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

async function getSpreadsheetMeta(client: any, p: any) {
  const res = await client.sheets.spreadsheet.get({ path: { spreadsheet_token: p.spreadsheet_token } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { spreadsheet: res.data?.spreadsheet };
}

async function listSheets(client: any, p: any) {
  const res = await client.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: p.spreadsheet_token } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { sheets: (res.data?.sheets ?? []).map((s: any) => ({ sheet_id: s.sheet_id, title: s.title, index: s.index, row_count: s.grid_properties?.row_count, column_count: s.grid_properties?.column_count })) };
}

async function readRange(client: any, p: any) {
  const res = await client.request({ method: "GET", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/values/${encodeURIComponent(p.range)}`, params: { valueRenderOption: p.render_option ?? "ToString", dateTimeRenderOption: "FormattedString" } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  const vr = res.data?.valueRange;
  return { range: vr?.range, values: vr?.values ?? [], row_count: vr?.values?.length ?? 0 };
}

async function writeRange(client: any, p: any) {
  const res = await client.request({ method: "PUT", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/values`, data: { valueRange: { range: p.range, values: p.values } } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { updated_range: res.data?.updatedRange, updated_rows: res.data?.updatedRows, updated_columns: res.data?.updatedColumns, updated_cells: res.data?.updatedCells };
}

async function appendRows(client: any, p: any) {
  const res = await client.request({ method: "POST", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/values_append`, data: { valueRange: { range: p.range, values: p.values } }, params: { insertDataOption: "INSERT_ROWS" } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { updated_range: res.data?.tableRange, updates: res.data?.updates };
}

async function setDimension(client: any, p: any) {
  const res = await client.request({ method: "PUT", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/dimension_range`, data: { dimension: { sheetId: p.sheet_id, majorDimension: p.dimension, startIndex: p.start_index, endIndex: p.end_index }, dimensionProperties: { visible: true, fixedSize: p.fixed_size } } });
  if (res.code !== 0) throw new Error(`${res.msg} (${res.code})`);
  return { success: true, dimension: p.dimension, range: `${p.start_index}-${p.end_index}`, size: p.fixed_size };
}

// ============ Auto-fit column widths ============

/** Estimate display width of a string (CJK chars count as 2, others as 1). */
function estimateWidth(text: string): number {
  let w = 0;
  for (const ch of String(text)) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\uAC00-\uD7AF]/.test(ch) ? 2 : 1;
  }
  return w;
}

async function autoFitColumns(client: any, p: any) {
  const PX_PER_CHAR = 8;
  const PADDING = 24;
  const MIN_COL = 50;
  const MAX_COL = 400;

  // 1. Get sheet info
  const sheetsRes = await client.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: p.spreadsheet_token } });
  if (sheetsRes.code !== 0) throw new Error(`List sheets: ${sheetsRes.msg} (${sheetsRes.code})`);
  const sheets = sheetsRes.data?.sheets ?? [];
  const sheet = p.sheet_id
    ? sheets.find((s: any) => s.sheet_id === p.sheet_id)
    : sheets[0];
  if (!sheet) throw new Error("Sheet not found");
  const sheetId = sheet.sheet_id;
  const colCount = sheet.grid_properties?.column_count ?? 10;
  const rowCount = Math.min(sheet.grid_properties?.row_count ?? 50, 100); // scan first 100 rows max

  // 2. Read data
  const range = `${sheetId}!A1:${String.fromCharCode(64 + Math.min(colCount, 26))}${rowCount}`;
  const readRes = await client.request({ method: "GET", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/values/${encodeURIComponent(range)}`, params: { valueRenderOption: "ToString" } });
  if (readRes.code !== 0) throw new Error(`Read range: ${readRes.msg} (${readRes.code})`);
  const rows = readRes.data?.valueRange?.values ?? [];

  // 3. Calculate max width per column
  const actualCols = Math.min(colCount, 26);
  const colMaxWidth: number[] = Array(actualCols).fill(0);
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < actualCols; c++) {
      const val = row[c];
      if (val === null || val === undefined || val === "") continue;
      const w = estimateWidth(String(val)) * PX_PER_CHAR + PADDING;
      if (w > colMaxWidth[c]) colMaxWidth[c] = w;
    }
  }

  // 4. Clamp and apply
  const results: { column: number; width: number }[] = [];
  for (let c = 0; c < actualCols; c++) {
    const width = Math.max(MIN_COL, Math.min(MAX_COL, colMaxWidth[c] || MIN_COL));
    const res = await client.request({ method: "PUT", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/dimension_range`, data: { dimension: { sheetId, majorDimension: "COLUMNS", startIndex: c + 1, endIndex: c + 1 }, dimensionProperties: { visible: true, fixedSize: width } } });
    if (res.code !== 0) throw new Error(`Set col ${c + 1} width: ${res.msg} (${res.code})`);
    results.push({ column: c + 1, width });
  }

  return { auto_fit: true, spreadsheet_token: p.spreadsheet_token, sheet_id: sheetId, columns: results };
}

// ============ Delete empty rows ============

async function deleteEmptyRows(client: any, p: any) {
  // 1. Get sheet info
  const sheetsRes = await client.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: p.spreadsheet_token } });
  if (sheetsRes.code !== 0) throw new Error(`List sheets: ${sheetsRes.msg} (${sheetsRes.code})`);
  const sheets = sheetsRes.data?.sheets ?? [];
  const targetSheets = p.sheet_id
    ? sheets.filter((s: any) => s.sheet_id === p.sheet_id)
    : sheets;
  if (targetSheets.length === 0) throw new Error("Sheet not found");

  const results: any[] = [];
  for (const sheet of targetSheets) {
    const sheetId = sheet.sheet_id;
    const rowCount = sheet.grid_properties?.row_count ?? 0;
    const colCount = sheet.grid_properties?.column_count ?? 26;
    if (rowCount === 0) continue;

    // 2. Read all data
    const lastCol = colCount <= 26 ? String.fromCharCode(64 + colCount) : "Z";
    const range = `${sheetId}!A1:${lastCol}${rowCount}`;
    const readRes = await client.request({ method: "GET", url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/values/${encodeURIComponent(range)}`, params: { valueRenderOption: "ToString" } });
    if (readRes.code !== 0) throw new Error(`Read ${sheetId}: ${readRes.msg} (${readRes.code})`);
    const rows = readRes.data?.valueRange?.values ?? [];

    // 3. Find empty rows (1-based indices for API)
    const emptyRowIndices: number[] = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isEmpty = !Array.isArray(row) || row.every((cell: any) => cell === null || cell === undefined || String(cell).trim() === "");
      if (isEmpty) emptyRowIndices.push(r + 1); // 1-based
    }
    // Also mark rows beyond data as empty (grid may have trailing empty rows)
    for (let r = rows.length + 1; r <= rowCount; r++) {
      emptyRowIndices.push(r);
    }

    if (emptyRowIndices.length === 0) {
      results.push({ sheet_id: sheetId, title: sheet.title, rows: rowCount, empty_rows: 0, deleted: 0 });
      continue;
    }

    // 4. Merge consecutive indices into ranges and delete from bottom to top
    // Must keep at least 1 row
    const maxDeletable = rowCount - 1;
    const toDelete = emptyRowIndices.slice(0, maxDeletable);
    if (toDelete.length === 0) {
      results.push({ sheet_id: sheetId, title: sheet.title, rows: rowCount, empty_rows: emptyRowIndices.length, deleted: 0, note: "Cannot delete all rows" });
      continue;
    }

    // Group consecutive indices into ranges for batch deletion
    const ranges: { start: number; end: number }[] = [];
    let i = 0;
    while (i < toDelete.length) {
      const start = toDelete[i];
      let end = start;
      while (i + 1 < toDelete.length && toDelete[i + 1] === end + 1) { end++; i++; }
      ranges.push({ start, end });
      i++;
    }

    // Delete from bottom to top to avoid index shift
    let deleted = 0;
    for (let ri = ranges.length - 1; ri >= 0; ri--) {
      const { start, end } = ranges[ri];
      const res = await client.request({
        method: "DELETE",
        url: `/open-apis/sheets/v2/spreadsheets/${p.spreadsheet_token}/dimension_range`,
        data: { dimension: { sheetId, majorDimension: "ROWS", startIndex: start, endIndex: end } },
      });
      if (res.code !== 0) {
        console.error(`Delete rows ${start}-${end} in ${sheetId}: ${res.msg} (${res.code})`);
      } else {
        deleted += (end - start + 1);
      }
    }

    results.push({ sheet_id: sheetId, title: sheet.title, original_rows: rowCount, empty_rows: toDelete.length, deleted });
  }

  return { spreadsheet_token: p.spreadsheet_token, sheets: results };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "get_meta": return getSpreadsheetMeta(client, p);
    case "list_sheets": return listSheets(client, p);
    case "read_range": return readRange(client, p);
    case "write_range": return writeRange(client, p);
    case "append": return appendRows(client, p);
    case "set_dimension": return setDimension(client, p);
    case "auto_fit": return autoFitColumns(client, p);
    case "delete_empty_rows": return deleteEmptyRows(client, p);
    default: throw new Error(`Unknown action: ${action}. Valid: get_meta, list_sheets, read_range, write_range, append, set_dimension, auto_fit, delete_empty_rows`);
  }
}

const DESCRIPTION = `Feishu Sheets (Spreadsheet) operations. Pass "action" and "params".
Actions:
• get_meta: {spreadsheet_token} — Get spreadsheet metadata
• list_sheets: {spreadsheet_token} — List all worksheets with sheet_id, title, dimensions
• read_range: {spreadsheet_token, range, render_option?} — Read cells. range: "Sheet1!A1:C10". render_option: ToString|FormattedValue|UnformattedValue
• write_range: {spreadsheet_token, range, values} — Write cells. values: [[row1col1,row1col2],[row2col1,row2col2]]
• append: {spreadsheet_token, range, values} — Append rows after last data row
• set_dimension: {spreadsheet_token, sheet_id, dimension, start_index, end_index, fixed_size} — Set column width/row height. dimension: COLUMNS|ROWS, indices 1-based
• auto_fit: {spreadsheet_token, sheet_id?} — Auto-fit all column widths based on cell content. Scans first 100 rows
• delete_empty_rows: {spreadsheet_token, sheet_id?} — Delete all empty rows from sheet(s). If sheet_id omitted, processes ALL sheets. For embedded sheets in docs, get spreadsheet_token from list_blocks (block_type=30)`;

const plugin = {
  id: "feishu-sheets",
  name: "Feishu Sheets",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-sheets: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_sheets", label: "Feishu Sheets", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_sheets" });
    api.logger.info?.("feishu-sheets: Registered 1 dispatcher tool (8 actions)");
  },
};

export default plugin;
