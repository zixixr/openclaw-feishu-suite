---
name: feishu-sheets
description: |
  Feishu Sheets (spreadsheet) operations. Activate when user mentions spreadsheet, cells, rows, columns, or /sheets/ URLs.
---

# Feishu Sheets Tools

Note: Feishu Sheets (电子表格) are different from Bitable (多维表格). Use feishu-bitable tools for Bitable.

## URL Format

`https://xxx.feishu.cn/sheets/TOKEN?sheet=SHEET_ID`

Extract `spreadsheet_token` from the URL path.

## Tools

### feishu_sheets_get_meta

Get spreadsheet metadata.

```json
{ "spreadsheet_token": "shtcnXXX" }
```

### feishu_sheets_list_sheets

List all worksheets with sheet_id, title, dimensions.

```json
{ "spreadsheet_token": "shtcnXXX" }
```

### feishu_sheets_read_range

Read cells from a range.

```json
{
  "spreadsheet_token": "shtcnXXX",
  "range": "Sheet1!A1:C10"
}
```

Whole column: `"Sheet1!A:C"`. Whole sheet: `"Sheet1"`.

### feishu_sheets_write_range

Write data to cells. Values is a 2D array.

```json
{
  "spreadsheet_token": "shtcnXXX",
  "range": "Sheet1!A1:C2",
  "values": [
    ["Name", "Age", "City"],
    ["Alice", 30, "Beijing"]
  ]
}
```

### feishu_sheets_append

Append rows after existing data.

```json
{
  "spreadsheet_token": "shtcnXXX",
  "range": "Sheet1!A1:C1",
  "values": [
    ["Bob", 25, "Shanghai"],
    ["Carol", 28, "Shenzhen"]
  ]
}
```

### feishu_sheets_set_dimension

Set column width or row height. Indices are 1-based, inclusive.

```json
{
  "spreadsheet_token": "shtcnXXX",
  "sheet_id": "abc123",
  "dimension": "COLUMNS",
  "start_index": 1,
  "end_index": 3,
  "fixed_size": 200
}
```

## Common Workflows

### Read a spreadsheet
1. `feishu_sheets_list_sheets` → get sheet names and IDs
2. `feishu_sheets_read_range` → read data

### Add data to a table
1. `feishu_sheets_list_sheets` → get sheet structure
2. `feishu_sheets_append` → add rows

### Adjust column widths
1. `feishu_sheets_list_sheets` → get sheet_id
2. `feishu_sheets_set_dimension` with COLUMNS

## Value Types

| Input | Result |
|-------|--------|
| `"text"` | String cell |
| `123` | Number cell |
| `true`/`false` | Boolean cell |
| `null` | Empty cell |

## Notes

- Range format: `SheetName!A1:C10` (sheet name + range)
- Sheet IDs from `feishu_sheets_list_sheets` are needed for `set_dimension`
- Max read: 5000 rows per request
