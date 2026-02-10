---
name: feishu-doc-enhanced
description: |
  Enhanced Feishu document creation with FULL table support. Activate when user asks to create or edit documents containing tables, structured data, or rich formatted content.
---

# Feishu Document Enhanced Tools

These tools provide **full table support** in Feishu documents. The built-in `feishu_doc` strips table blocks — use these tools instead when content includes tables.

## When to Use

- **Use `feishu_doc_create_rich`** when creating a NEW document that contains tables or mixed content (text + tables).
- **Use `feishu_doc_write_rich`** when adding content with tables to an EXISTING document.
- **Use `feishu_doc_insert_table`** when you only need to add a data table to an existing document.
- **Use built-in `feishu_doc`** only for plain text documents without any tables.

## Tools

### feishu_doc_create_rich

Create a new document and write markdown content (including tables) in one step.

```json
{
  "title": "Weather Report",
  "content": "# 10-Day Weather Report\n\nBelow is the temperature data:\n\n| Date | High | Low | Condition |\n|------|------|-----|----------|\n| 2/1 | 5°C | -2°C | Sunny |\n| 2/2 | 3°C | -4°C | Cloudy |\n| 2/3 | 7°C | 0°C | Sunny |\n\n## Notes\n\nData sourced from weather service."
}
```

### feishu_doc_write_rich

Write/append markdown content (including tables) to an existing document.

```json
{
  "document_id": "VIYcdZBY9oKGYfxSLJkcKWXjnHc",
  "content": "## Sales Data\n\n| Product | Q1 | Q2 | Q3 |\n|---------|----|----|----|\n| Widget A | 100 | 150 | 200 |\n| Widget B | 80 | 90 | 120 |"
}
```

### feishu_doc_insert_table

Insert a table with structured data (headers + rows) into a document.

```json
{
  "document_id": "VIYcdZBY9oKGYfxSLJkcKWXjnHc",
  "headers": ["City", "Temperature", "Humidity"],
  "rows": [
    ["Beijing", "5°C", "40%"],
    ["Shanghai", "8°C", "65%"],
    ["Shenzhen", "18°C", "70%"]
  ]
}
```

## Markdown Format

The `content` parameter accepts standard markdown:

| Syntax | Result |
|--------|--------|
| `# Heading` | Heading levels 1-6 |
| `Plain text` | Paragraph |
| `**bold**` | Bold text |
| `*italic*` | Italic text |
| `` `code` `` | Inline code |
| `- item` | Bullet list |
| `1. item` | Numbered list |
| ` ```lang ``` ` | Code block |
| `| a | b |` | Table (with header separator) |
| `---` | Horizontal rule |

## Common Workflows

### Create a document with table content
1. `feishu_doc_create_rich` with title + markdown content including tables
2. `feishu_perm_grant` to give the requesting user edit access (use SenderId as open_id)

### Add a table to an existing document
1. `feishu_doc_insert_table` with headers and rows
   OR
2. `feishu_doc_write_rich` with markdown containing the table

## Important Notes

- **Always grant permissions after creating**: Call `feishu_perm_grant` with the requesting user's SenderId after `feishu_doc_create_rich`.
- **Table cell content**: All cell values are strings. Numbers should be formatted as strings (e.g., `"100"`, `"5°C"`).
- **Header row**: The first row of every table is automatically styled as bold headers.
- **Mixed content**: A single `content` string can contain multiple sections — text, tables, code blocks, etc. They appear in document order.
