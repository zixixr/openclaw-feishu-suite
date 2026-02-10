const { createRequire } = require("module");
const appRequire = createRequire("/app/package.json");
const Lark = appRequire("@larksuiteoapi/node-sdk");
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("/home/node/.openclaw/openclaw.json","utf8"));
const acc = cfg.channels.feishu.accounts.main;
const client = new Lark.Client({appId:acc.appId,appSecret:acc.appSecret,appType:Lark.AppType.SelfBuild,domain:Lark.Domain.Feishu});

const md = "# 气温测试\n\n北京最近3天气温：\n\n| 日期 | 最高温 | 最低温 |\n|------|--------|--------|\n| 2/7 | 5°C | -3°C |\n| 2/8 | 3°C | -5°C |\n\n## 备注\n\n记得多穿衣服。";
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Step 1: Convert markdown
  const cv = await client.docx.document.convert({ data: { content_type: "markdown", content: md } });
  if (cv.code !== 0) { console.log("convert fail:", cv.msg); return; }
  const blocks = cv.data.blocks;
  const firstLevel = cv.data.first_level_block_ids;
  const blockMap = new Map(blocks.map(b => [b.block_id, b]));
  console.log("Converted:", blocks.length, "blocks,", firstLevel.length, "top-level");

  // Step 2: Create doc
  const cr = await client.docx.document.create({ data: { title: "增强版气温测试" } });
  if (cr.code !== 0) { console.log("create fail:", cr.msg); return; }
  const docId = cr.data.document.document_id;
  console.log("Doc:", docId);

  var pending = [];
  var blocksCreated = 0;
  var tablesFilled = 0;

  async function flush() {
    if (!pending.length) return;
    var r = await client.docx.documentBlockChildren.create({
      path: { document_id: docId, block_id: docId },
      data: { children: pending, index: -1 }
    });
    if (r.code !== 0) console.log("flush fail:", r.code, r.msg);
    else blocksCreated += (r.data.children || []).length;
    pending = [];
  }

  function cleanBlock(b) {
    var copy = {};
    for (var k in b) {
      if (k !== "block_id" && k !== "parent_id" && k !== "children") copy[k] = b[k];
    }
    return copy;
  }

  // Step 3: Process blocks in order
  for (var idx = 0; idx < firstLevel.length; idx++) {
    var bid = firstLevel[idx];
    var b = blockMap.get(bid);
    if (!b) continue;

    if (b.block_type === 31) {
      // TABLE: flush pending, create skeleton, fill cells
      await flush();
      var prop = b.table.property;
      var colW = prop.column_width || Array(prop.column_size).fill(200);

      var tr = await client.docx.documentBlockChildren.create({
        path: { document_id: docId, block_id: docId },
        data: {
          children: [{
            block_type: 31,
            table: {
              property: {
                row_size: prop.row_size,
                column_size: prop.column_size,
                column_width: colW,
                header_row: prop.header_row || false
              }
            }
          }],
          index: -1
        }
      });
      if (tr.code !== 0) { console.log("table fail:", tr.code, tr.msg); continue; }

      var realCells = (tr.data.children[0].table || {}).cells || [];
      var tempCells = b.table.cells || [];
      console.log("Table: real=" + realCells.length + " temp=" + tempCells.length);

      for (var i = 0; i < Math.min(realCells.length, tempCells.length); i++) {
        var tc = blockMap.get(tempCells[i]);
        if (!tc || !tc.children || !tc.children.length) continue;

        var kids = [];
        for (var j = 0; j < tc.children.length; j++) {
          var child = blockMap.get(tc.children[j]);
          if (child) kids.push(cleanBlock(child));
        }
        if (!kids.length) continue;

        await sleep(200);
        var cr2 = await client.docx.documentBlockChildren.create({
          path: { document_id: docId, block_id: realCells[i] },
          data: { children: kids }
        });
        if (cr2.code === 0) tablesFilled++;
        else console.log("  cell " + i + " fail:", cr2.code, cr2.msg);
      }
    } else if (b.block_type !== 32) {
      pending.push(cleanBlock(b));
    }
  }

  await flush();
  console.log("Done! blocks=" + blocksCreated + " cells=" + tablesFilled);
  console.log("URL: https://feishu.cn/docx/" + docId);
})().catch(function (e) { console.error(e.message || e); });
