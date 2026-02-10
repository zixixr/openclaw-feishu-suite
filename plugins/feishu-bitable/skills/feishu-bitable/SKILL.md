---
name: feishu-bitable
description: |
  Feishu Bitable (multi-dimensional table) operations. Activate when user mentions bitable, multi-dimensional table, base, or /base/ links.
---

# Feishu Bitable Tools

Tools for reading, creating, and editing Feishu Bitable (multi-dimensional tables).

## URL Formats

- Base: `https://xxx.feishu.cn/base/APP_TOKEN?table=TABLE_ID&view=VIEW_ID`
- Wiki: `https://xxx.feishu.cn/wiki/NODE_TOKEN?table=TABLE_ID`

Always start with `feishu_bitable_get_meta` when given a URL.

## Tools

### feishu_bitable_get_meta

Parse a Bitable URL and get app_token, table_id, and table list.

```json
{ "url": "https://xxx.feishu.cn/base/ABC123?table=tblXXX" }
```

Returns: `app_token`, `table_id`, `name`, `tables[]`. Use these values for all other tools.

### feishu_bitable_list_fields

List all fields (columns) in a table with types and properties.

```json
{ "app_token": "ABC123", "table_id": "tblXXX" }
```

### feishu_bitable_list_records

List records (rows) with pagination.

```json
{ "app_token": "ABC123", "table_id": "tblXXX", "page_size": 100 }
```

With pagination:

```json
{ "app_token": "ABC123", "table_id": "tblXXX", "page_token": "recXXX" }
```

### feishu_bitable_search_records

Search records with filter and sort conditions.

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "filter": {
    "conjunction": "and",
    "conditions": [
      { "field_name": "Status", "operator": "is", "value": ["In Progress"] }
    ]
  },
  "sort": [{ "field_name": "Due Date", "desc": false }],
  "page_size": 100
}
```

#### Filter Operators

| Operator           | Description    | Applicable Types       |
| ------------------ | -------------- | ---------------------- |
| is                 | Equals         | All                    |
| isNot              | Not equals     | Except DateTime        |
| contains           | Contains       | Text, MultiSelect      |
| doesNotContain     | Not contains   | Text, MultiSelect      |
| isEmpty            | Is empty       | All                    |
| isNotEmpty         | Is not empty   | All                    |
| isGreater          | Greater than   | Number, DateTime       |
| isGreaterEqual     | >= (gte)       | Number                 |
| isLess             | Less than      | Number, DateTime       |
| isLessEqual        | <= (lte)       | Number                 |

### feishu_bitable_get_record

Get a single record by ID.

```json
{ "app_token": "ABC123", "table_id": "tblXXX", "record_id": "recXXX" }
```

### feishu_bitable_create_record

Create a new record (row).

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "fields": {
    "Task Name": "Complete API integration",
    "Status": "In Progress",
    "Due Date": 1707523200000,
    "Assignee": [{ "id": "ou_xxxxx" }]
  }
}
```

### feishu_bitable_batch_create_records

Batch create records (up to 500 per call).

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "records": [
    { "fields": { "Name": "Item 1", "Status": "New" } },
    { "fields": { "Name": "Item 2", "Status": "New" } }
  ]
}
```

### feishu_bitable_update_record

Update an existing record.

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "record_id": "recXXX",
  "fields": { "Status": "Done" }
}
```

### feishu_bitable_batch_update_records

Batch update records (up to 500 per call).

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "records": [
    { "record_id": "recAAA", "fields": { "Status": "Done" } },
    { "record_id": "recBBB", "fields": { "Status": "Done" } }
  ]
}
```

### feishu_bitable_delete_record

Delete a single record.

```json
{ "app_token": "ABC123", "table_id": "tblXXX", "record_id": "recXXX" }
```

### feishu_bitable_batch_delete_records

Batch delete records.

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "record_ids": ["recAAA", "recBBB", "recCCC"]
}
```

### feishu_bitable_create_field

Create a new field (column) in a table.

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "field_name": "Priority",
  "type": 3,
  "property": {
    "options": [
      { "name": "P0-Critical", "color": 0 },
      { "name": "P1-High", "color": 1 },
      { "name": "P2-Medium", "color": 2 }
    ]
  }
}
```

### feishu_bitable_update_field

Update field properties.

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "field_id": "fldXXX",
  "field_name": "New Name",
  "property": {}
}
```

### feishu_bitable_delete_field

Delete a field.

```json
{ "app_token": "ABC123", "table_id": "tblXXX", "field_id": "fldXXX" }
```

### feishu_bitable_list_views

List all views in a table.

```json
{ "app_token": "ABC123", "table_id": "tblXXX" }
```

### feishu_bitable_create_view

Create a new view.

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "view_name": "Active Tasks",
  "view_type": "kanban"
}
```

View types: `grid`, `kanban`, `gallery`, `gantt`, `form`, `calendar`

### feishu_bitable_update_view

Update view configuration (filters, sorting, field visibility).

```json
{
  "app_token": "ABC123",
  "table_id": "tblXXX",
  "view_id": "vewXXX",
  "view_name": "Task Board",
  "property": {
    "filter_info": {
      "conjunction": "and",
      "conditions": [
        { "field_id": "fldXXX", "operator": "isNot", "value": ["Done"] }
      ]
    }
  }
}
```

### feishu_bitable_delete_view

Delete a view.

```json
{ "app_token": "ABC123", "table_id": "tblXXX", "view_id": "vewXXX" }
```

## Field Type Reference

| type | ui_type      | Name           | Description           |
| ---- | ------------ | -------------- | --------------------- |
| 1    | Text         | Multi-line     | Rich text             |
| 1    | Barcode      | Barcode        | Barcode/QR            |
| 2    | Number       | Number         | Formatted number      |
| 2    | Progress     | Progress       | 0-100 progress bar    |
| 2    | Currency     | Currency       | Currency format       |
| 2    | Rating       | Rating         | Star rating           |
| 3    | SingleSelect | Single select  | Dropdown              |
| 4    | MultiSelect  | Multi select   | Tags                  |
| 5    | DateTime     | Date           | Date/time             |
| 7    | Checkbox     | Checkbox       | Boolean               |
| 11   | User         | Person         | Feishu user           |
| 13   | Phone        | Phone          | Phone number          |
| 15   | Url          | URL            | Hyperlink             |
| 17   | Attachment   | Attachment     | File attachment       |
| 18   | SingleLink   | One-way link   | Link to another table |
| 20   | Formula      | Formula        | Computed field        |
| 21   | DuplexLink   | Two-way link   | Bidirectional link    |
| 22   | Location     | Location       | Geo coordinates       |
| 23   | GroupChat    | Group          | Feishu group          |
| 1001 | CreatedTime  | Created time   | Auto-generated        |
| 1002 | ModifiedTime | Modified time  | Auto-generated        |
| 1003 | CreatedUser  | Created by     | Auto-generated        |
| 1004 | ModifiedUser | Modified by    | Auto-generated        |
| 1005 | AutoNumber   | Auto number    | Auto-increment        |

## Field Value Formats

| Type         | Format     | Example                                    |
| ------------ | ---------- | ------------------------------------------ |
| Text         | string     | `"content"`                                |
| Number       | number     | `123.45`                                   |
| SingleSelect | string     | `"Option Name"`                            |
| MultiSelect  | array      | `["Option1", "Option2"]`                   |
| DateTime     | number(ms) | `1707523200000`                            |
| Checkbox     | boolean    | `true`                                     |
| User         | array      | `[{"id": "ou_xxx"}]`                       |
| URL          | object     | `{"text": "Display", "link": "https://"}` |
| Attachment   | array      | `[{"file_token": "xxx"}]`                  |
| Link         | array      | `[{"record_id": "recXXX"}]`               |

## Common Workflows

### Read complete bitable structure

1. `feishu_bitable_get_meta` with URL -> get app_token + tables
2. `feishu_bitable_list_fields` for each table -> get columns
3. `feishu_bitable_list_views` for each table -> get views
4. Return full structure

### Search and filter records

1. `feishu_bitable_get_meta` -> get app_token, table_id
2. `feishu_bitable_list_fields` -> understand field names/types
3. `feishu_bitable_search_records` with filter conditions

### Bulk data import

1. `feishu_bitable_list_fields` -> get target table schema
2. Transform data to match field types
3. `feishu_bitable_batch_create_records` (max 500 per call)

## Rate Limits

- Read: 100 requests/minute
- Write: 50 requests/minute
- Batch create/update: max 500 records per call
- Max 100 tables per bitable, 50,000 records per table

## Error Codes

| Code    | Description       | Action                    |
| ------- | ----------------- | ------------------------- |
| 1254000 | Invalid parameter | Check request format      |
| 1254001 | App not found     | Check app_token           |
| 1254002 | Table not found   | Check table_id            |
| 1254003 | Field not found   | Check field_id/field_name |
| 1254004 | Record not found  | Check record_id           |
| 1254005 | View not found    | Check view_id             |
| 1254040 | No permission     | Check app permissions     |
| 1254041 | Quota exceeded    | Check data limits         |

## Permissions

Required: `bitable:app` (read+write) or `bitable:app:readonly` (read only)

## Configuration

```yaml
channels:
  feishu:
    tools:
      bitable: true # default: true when feishu credentials configured
```
