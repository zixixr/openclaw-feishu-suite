---
name: feishu-permission
description: |
  Feishu document permission management. Activate when user mentions sharing, permissions, collaborators, or after creating any document.
---

# Feishu Permission Tools

## CRITICAL: Auto-Grant After Document Creation

**Every time you create a document (doc, sheet, bitable), IMMEDIATELY call `feishu_perm_grant` to give the requesting user edit access.**

```json
{
  "token": "<newly_created_doc_token>",
  "type": "docx",
  "member_type": "openid",
  "member_id": "<SenderId from message context>",
  "perm": "edit"
}
```

## Tools

### feishu_perm_grant

Grant permission to a user or group on a document.

```json
{
  "token": "doxcnXXX",
  "type": "docx",
  "member_type": "openid",
  "member_id": "ou_xxxxx",
  "perm": "edit"
}
```

| Parameter | Values |
|-----------|--------|
| `type` | doc, docx, sheet, bitable, file, wiki, folder, mindnote, minutes, slides |
| `member_type` | openid, email, userid, unionid, openchat, opendepartmentid, groupid |
| `perm` | view, edit, full_access |

### feishu_perm_list

List current collaborators on a document.

```json
{ "token": "doxcnXXX", "type": "docx" }
```

### feishu_perm_revoke

Remove a collaborator.

```json
{
  "token": "doxcnXXX",
  "type": "docx",
  "member_type": "openid",
  "member_id": "ou_xxxxx"
}
```

## Common Workflows

### Share document with a person by email
1. `feishu_contact_lookup` with email → get open_id
2. `feishu_perm_grant` with openid + edit permission

### Share document with a group chat
1. Use `feishu_perm_grant` with `member_type: "openchat"` and the chat_id
