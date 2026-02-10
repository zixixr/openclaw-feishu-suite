/**
 * Feishu Document Enhanced plugin for OpenClaw — single dispatcher tool.
 * Full table support (bypasses built-in UNSUPPORTED_CREATE_TYPES filter).
 */
import { createRequire } from "node:module";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const appRequire = createRequire("/app/package.json");
const Lark = appRequire("@larksuiteoapi/node-sdk");
const { Type } = appRequire("@sinclair/typebox");

type FeishuDomain = "feishu" | "lark" | (string & {});

function json(data: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data }; }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

// ============ Convert & Write ============

async function convertMarkdown(client: any, markdown: string) {
  const res = await client.docx.document.convert({ data: { content_type: "markdown", content: markdown } });
  if (res.code !== 0) throw new Error(`Convert failed: ${res.msg} (${res.code})`);
  return { blocks: (res.data?.blocks ?? []) as any[], firstLevelBlockIds: (res.data?.first_level_block_ids ?? []) as string[] };
}

async function writeConvertedContent(client: any, docId: string, markdown: string): Promise<{ blocks_created: number; tables_created: number; cells_filled: number }> {
  const { blocks, firstLevelBlockIds } = await convertMarkdown(client, markdown);
  const blockMap = new Map<string, any>();
  for (const b of blocks) blockMap.set(b.block_id, b);

  let blocksCreated = 0, tablesCreated = 0, cellsFilled = 0;
  let pendingBlocks: any[] = [];

  async function flushPending() {
    if (pendingBlocks.length === 0) return;
    const res = await client.docx.documentBlockChildren.create({ path: { document_id: docId, block_id: docId }, data: { children: pendingBlocks, index: -1 } });
    if (res.code !== 0) throw new Error(`Insert blocks failed: ${res.msg} (${res.code})`);
    blocksCreated += res.data?.children?.length ?? pendingBlocks.length;
    pendingBlocks = [];
  }

  for (const blockId of firstLevelBlockIds) {
    const block = blockMap.get(blockId);
    if (!block) continue;

    if (block.block_type === 31) {
      await flushPending();
      const prop = block.table?.property;
      if (!prop?.row_size || !prop?.column_size) continue;
      const { row_size, column_size } = prop;
      const colWidth = prop.column_width ?? Array(column_size).fill(Math.max(Math.floor(600 / column_size), 100));

      const tableRes = await client.docx.documentBlockChildren.create({
        path: { document_id: docId, block_id: docId },
        data: { children: [{ block_type: 31, table: { property: { row_size, column_size, column_width: colWidth, header_row: prop.header_row ?? false } } }], index: -1 },
      });
      if (tableRes.code !== 0) throw new Error(`Create table failed: ${tableRes.msg} (${tableRes.code})`);

      const createdTable = tableRes.data?.children?.[0];
      let realCells: string[] = createdTable?.table?.cells ?? [];
      if (realCells.length === 0 && createdTable?.block_id) {
        const br = await client.docx.documentBlock.get({ path: { document_id: docId, block_id: createdTable.block_id } });
        if (br.code === 0) realCells = br.data?.block?.table?.cells ?? [];
      }

      const tempCells: string[] = block.table?.cells ?? [];
      for (let i = 0; i < Math.min(realCells.length, tempCells.length); i++) {
        const tempCellBlock = blockMap.get(tempCells[i]);
        if (!tempCellBlock) continue;
        const childIds: string[] = tempCellBlock.children ?? [];
        if (childIds.length === 0) continue;
        const childBlocks = childIds.map((cid: string) => blockMap.get(cid)).filter(Boolean)
          .map((cb: any) => { const { block_id: _b, parent_id: _p, children: _c, ...rest } = cb; return rest; })
          .filter((cb: any) => cb.block_type !== undefined);
        if (childBlocks.length === 0) continue;
        await sleep(200);
        try {
          const cr = await client.docx.documentBlockChildren.create({ path: { document_id: docId, block_id: realCells[i] }, data: { children: childBlocks } });
          if (cr.code === 0) cellsFilled++;
        } catch (err: any) { console.error(`Fill cell ${i} failed:`, err?.message ?? err); }
      }
      tablesCreated++;
    } else if (block.block_type !== 32) {
      const { block_id: _b, parent_id: _p, children: _c, ...cleanBlock } = block;
      pendingBlocks.push(cleanBlock);
    }
  }
  await flushPending();
  return { blocks_created: blocksCreated, tables_created: tablesCreated, cells_filled: cellsFilled };
}

// ============ Direct table insertion ============

type TextElement = { text_run: { content: string; text_element_style?: Record<string, any> } };

function parseInline(text: string): TextElement[] {
  if (!text || !text.trim()) return [{ text_run: { content: text || " " } }];
  const elements: TextElement[] = [];
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) elements.push({ text_run: { content: text.slice(lastIndex, match.index) } });
    if (match[2]) elements.push({ text_run: { content: match[2], text_element_style: { bold: true } } });
    else if (match[4]) elements.push({ text_run: { content: match[4], text_element_style: { italic: true } } });
    else if (match[6]) elements.push({ text_run: { content: match[6], text_element_style: { inline_code: true } } });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) elements.push({ text_run: { content: text.slice(lastIndex) } });
  const filtered = elements.filter(e => e.text_run.content.length > 0);
  return filtered.length > 0 ? filtered : [{ text_run: { content: text } }];
}

async function insertTableFromData(client: any, docId: string, headers: string[], rows: string[][], index: number = -1) {
  const colCount = headers.length, rowCount = rows.length + 1;
  const colWidth = headers.map(() => Math.max(Math.floor(600 / colCount), 100));
  const tableRes = await client.docx.documentBlockChildren.create({
    path: { document_id: docId, block_id: docId },
    data: { children: [{ block_type: 31, table: { property: { row_size: rowCount, column_size: colCount, column_width: colWidth, header_row: true } } }], index },
  });
  if (tableRes.code !== 0) throw new Error(`Create table failed: ${tableRes.msg} (${tableRes.code})`);

  const tableBlock = tableRes.data?.children?.[0];
  let cellIds: string[] = tableBlock?.table?.cells ?? [];
  if (cellIds.length === 0 && tableBlock?.block_id) {
    const br = await client.docx.documentBlock.get({ path: { document_id: docId, block_id: tableBlock.block_id } });
    if (br.code === 0) cellIds = br.data?.block?.table?.cells ?? [];
  }
  if (cellIds.length !== rowCount * colCount) throw new Error(`Cell count mismatch: expected ${rowCount * colCount}, got ${cellIds.length}`);

  const allRows = [headers, ...rows];
  let filled = 0;
  for (let r = 0; r < allRows.length; r++) {
    for (let c = 0; c < colCount; c++) {
      const cellText = (allRows[r]?.[c] ?? "").trim();
      if (!cellText) continue;
      const elements = parseInline(cellText);
      if (r === 0) for (const el of elements) el.text_run.text_element_style = { ...el.text_run.text_element_style, bold: true };
      await sleep(200);
      try {
        const cr = await client.docx.documentBlockChildren.create({ path: { document_id: docId, block_id: cellIds[r * colCount + c] }, data: { children: [{ block_type: 2, text: { elements } }] } });
        if (cr.code === 0) filled++;
      } catch (err: any) { console.error(`Fill cell [${r},${c}] failed:`, err?.message ?? err); }
    }
  }
  return { table_block_id: tableBlock?.block_id, rows: rowCount, columns: colCount, cells_filled: filled };
}

// ============ Dispatcher ============

async function dispatch(client: any, action: string, p: any): Promise<any> {
  switch (action) {
    case "create_rich": {
      const createRes = await client.docx.document.create({ data: { title: p.title, folder_token: p.folder_token } });
      if (createRes.code !== 0) throw new Error(`Create failed: ${createRes.msg} (${createRes.code})`);
      const docId = createRes.data?.document?.document_id;
      if (!docId) throw new Error("No document_id in response");
      const result = await writeConvertedContent(client, docId, p.content);
      return { document_id: docId, title: p.title, url: `https://feishu.cn/docx/${docId}`, ...result };
    }
    case "write_rich": {
      const result = await writeConvertedContent(client, p.document_id, p.content);
      return { document_id: p.document_id, ...result };
    }
    case "insert_table": {
      const result = await insertTableFromData(client, p.document_id, p.headers, p.rows, p.index ?? -1);
      return { document_id: p.document_id, ...result };
    }
    default: throw new Error(`Unknown action: ${action}. Valid: create_rich, write_rich, insert_table`);
  }
}

const DESCRIPTION = `Feishu Document Enhanced — rich documents with FULL table support. Pass "action" and "params".
Actions:
• create_rich: {title, content, folder_token?} — Create doc + write markdown (tables fully supported). Use instead of built-in feishu_doc when content has tables
• write_rich: {document_id, content} — Append markdown (with tables) to existing doc
• insert_table: {document_id, headers, rows, index?} — Insert structured data table. headers: ["Col1","Col2"], rows: [["a","b"],["c","d"]], index: -1 for append`;

const plugin = {
  id: "feishu-doc-enhanced",
  name: "Feishu Document Enhanced",
  register(api: OpenClawPluginApi) {
    const creds = resolveCredentials(api.config);
    if (!creds) { api.logger.debug?.("feishu-doc-enhanced: No credentials, skipping"); return; }
    const client = createClient(creds.appId, creds.appSecret, creds.domain);
    api.registerTool({
      name: "feishu_doc_enhanced", label: "Feishu Doc Enhanced", description: DESCRIPTION,
      parameters: Type.Object({ action: Type.String({ description: "Action name" }), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
      execute: async (_id: string, args: any) => {
        try { return json(await dispatch(client, args.action, args.params ?? {})); }
        catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }); }
      },
    }, { name: "feishu_doc_enhanced" });
    api.logger.info?.("feishu-doc-enhanced: Registered 1 dispatcher tool (3 actions)");
  },
};

export default plugin;
