---
name: feishu-calendar
description: |
  Feishu calendar management. Activate when user mentions meetings, schedule, calendar, events, availability.
---

# Feishu Calendar Tools

## Tools

### feishu_cal_list_calendars

List accessible calendars.

```json
{}
```

### feishu_cal_list_events

List events in a time range. Timestamps are Unix seconds.

```json
{
  "calendar_id": "primary",
  "start_time": "1707523200",
  "end_time": "1707609600"
}
```

### feishu_cal_get_event

Get event details.

```json
{ "calendar_id": "primary", "event_id": "evt_xxxxx" }
```

### feishu_cal_create_event

Create an event with optional attendees. Internally handles both event creation and attendee invitation.

```json
{
  "calendar_id": "primary",
  "summary": "Team Standup",
  "description": "Daily sync meeting",
  "start_time": "1707534000",
  "end_time": "1707535800",
  "attendee_open_ids": ["ou_user1", "ou_user2"],
  "location": "Meeting Room A",
  "reminders": [15, 5]
}
```

### feishu_cal_update_event

Reschedule or modify an event.

```json
{
  "calendar_id": "primary",
  "event_id": "evt_xxxxx",
  "summary": "Updated: Team Standup",
  "start_time": "1707537600"
}
```

### feishu_cal_delete_event

Cancel/delete an event.

```json
{ "calendar_id": "primary", "event_id": "evt_xxxxx" }
```

### feishu_cal_freebusy

Check a user's availability before scheduling.

```json
{
  "time_min": "1707523200",
  "time_max": "1707609600",
  "user_open_id": "ou_xxxxx"
}
```

## Common Workflows

### Schedule a meeting with someone
1. `feishu_contact_lookup` or `feishu_contact_search` → get attendee open_ids
2. `feishu_cal_freebusy` → check availability for each attendee
3. `feishu_cal_create_event` with attendee_open_ids → create and invite

### Check today's schedule
1. Calculate today's start/end timestamps (Unix seconds)
2. `feishu_cal_list_events` with time range

## Notes

- Calendar ID `primary` refers to the bot's own calendar
- All timestamps are Unix seconds (NOT milliseconds)
- Reminders array contains minutes before the event (e.g., [15] = 15 min before)
