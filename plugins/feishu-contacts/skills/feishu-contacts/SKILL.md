---
name: feishu-contacts
description: |
  Feishu people directory. Activate when user mentions a person by name, email, or phone, or needs to find someone.
---

# Feishu Contacts Tools

## Tools

### feishu_contact_lookup

Find user open_id by email or phone. Essential before granting permissions, assigning tasks, or inviting to meetings.

```json
{ "emails": ["alice@company.com"] }
```

```json
{ "mobiles": ["+8613800138000"] }
```

Can query up to 50 emails and 50 phones in one call.

### feishu_contact_get_user

Get detailed profile by open_id.

```json
{ "open_id": "ou_xxxxx" }
```

Returns: name, email, mobile, department_ids, job_title, avatar, status.

### feishu_contact_search

Search users by name keyword.

```json
{ "query": "Alice", "page_size": 10 }
```

## Common Patterns

- Before any tool that needs a user's open_id, call `feishu_contact_lookup` first
- Use `feishu_contact_search` when you only have a partial name
- The `SenderId` in message context is already an open_id — no lookup needed for the requesting user
