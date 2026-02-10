---
name: feishu-task
description: |
  Feishu task management. Activate when user mentions tasks, to-dos, assignments, deadlines.
---

# Feishu Task Tools

## Tools

### feishu_task_create

Create a task with optional due date and assignees.

```json
{
  "summary": "Review the Q1 report",
  "description": "Check numbers and add commentary",
  "due_timestamp": "1708300800",
  "assignee_open_ids": ["ou_xxxxx"]
}
```

### feishu_task_get

Get task details.

```json
{ "task_id": "d300e893-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

### feishu_task_list

List tasks with optional filters.

```json
{ "page_size": 20, "completed": false }
```

### feishu_task_update

Update task summary, description, or due date.

```json
{
  "task_id": "d300e893-xxxx",
  "summary": "Updated: Review Q1 report by Friday",
  "due_timestamp": "1708473600"
}
```

Set `due_timestamp` to `"0"` to remove the due date.

### feishu_task_complete

Mark a task as completed.

```json
{ "task_id": "d300e893-xxxx" }
```

## Common Workflows

### Create and assign a task
1. `feishu_contact_lookup` → get assignee's open_id
2. `feishu_task_create` with assignee_open_ids and due date

### Review pending tasks
1. `feishu_task_list` with `completed: false`

## Notes

- All timestamps are Unix seconds
- Task IDs are GUIDs (long format like d300e893-...)
- Uses Feishu Task v2 API
