---
name: feishu-messaging
description: |
  Feishu messaging. Activate when user asks to send a message, notify someone, or query group chats.
---

# Feishu Messaging Tools

## Tools

### feishu_msg_send

Send a message to a user or group chat.

**Text message to a user:**
```json
{
  "receive_id": "ou_xxxxx",
  "receive_id_type": "open_id",
  "msg_type": "text",
  "content": "{\"text\":\"Hello, the meeting is at 3pm today.\"}"
}
```

**Rich text (post) to a group:**
```json
{
  "receive_id": "oc_xxxxx",
  "receive_id_type": "chat_id",
  "msg_type": "post",
  "content": "{\"zh_cn\":{\"title\":\"Meeting Reminder\",\"content\":[[{\"tag\":\"text\",\"text\":\"Please join at 3pm.\"}]]}}"
}
```

### feishu_msg_send_card

Send an interactive card message.

```json
{
  "receive_id": "ou_xxxxx",
  "receive_id_type": "open_id",
  "card_content": "{\"elements\":[{\"tag\":\"markdown\",\"content\":\"**Task completed!**\\nAll items have been processed.\"}],\"header\":{\"title\":{\"tag\":\"plain_text\",\"content\":\"Status Update\"}}}"
}
```

### feishu_msg_reply

Reply to a specific message (threaded).

```json
{
  "message_id": "om_xxxxx",
  "msg_type": "text",
  "content": "{\"text\":\"Done! The document has been updated.\"}"
}
```

### feishu_msg_list_chats

List group chats the bot is in.

```json
{ "page_size": 50 }
```

### feishu_msg_chat_members

List members of a group chat.

```json
{ "chat_id": "oc_xxxxx" }
```

## Content Format Reference

| msg_type | content format |
|----------|---------------|
| text | `{"text": "plain text"}` |
| post | `{"zh_cn": {"title": "Title", "content": [[{"tag": "text", "text": "body"}]]}}` |
| interactive | Card JSON (use feishu_msg_send_card instead) |

## Notes

- The bot can only send DMs to users who have chatted with it before
- The bot must be a member of a group to send messages there
- Use `feishu_contact_lookup` to get a user's open_id before messaging
