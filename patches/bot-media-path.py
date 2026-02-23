#!/usr/bin/env python3
"""
Patch: bot-media-path
Target: /app/extensions/feishu/src/bot.ts (inside Docker container)

Problem: Media Understanding processes inbound images and suppresses the
         [media attached: /path] note. The model can SEE the image (multimodal)
         but doesn't know the local file path, so it can't upload to Bitable.

Fix: Always append inbound media file paths to the message body, regardless
     of whether Media Understanding suppresses the default note.

Usage:
  docker cp patches/bot-media-path.py openclaw-gateway:/tmp/
  docker exec openclaw-gateway python3 /tmp/bot-media-path.py
  docker restart openclaw-gateway

Idempotent: safe to run multiple times.
"""

import sys

path = "/app/extensions/feishu/src/bot.ts"

try:
    with open(path, "r") as f:
        content = f.read()
except FileNotFoundError:
    print(f"ERROR: {path} not found. Is this running inside the Docker container?")
    sys.exit(1)

MARKER = "// Append inbound media file paths"

# Remove any previously injected patch (idempotent)
lines = content.split("\n")
new_lines = []
skip = False
for line in lines:
    if MARKER in line:
        skip = True
        continue
    if skip and "const envelopeFrom" in line:
        skip = False
    if skip:
        continue
    new_lines.append(line)

content = "\n".join(new_lines)

# Insert clean patch before envelopeFrom
target = '    const envelopeFrom = isGroup ? `${ctx.chatId}:${ctx.senderOpenId}` : ctx.senderOpenId;'

if target not in content:
    print("ERROR: target line not found in bot.ts — file structure may have changed")
    sys.exit(1)

# Use raw string to keep \n as literal JS escape sequences
patch_lines = [
    f'    {MARKER} so the model knows where downloaded files are saved.',
    '    // Media Understanding may suppress the default [media attached:] note, so we always include paths here.',
    '    if (mediaList.length > 0) {',
    '      const savedPaths = mediaList.map((m) => m.path).filter(Boolean);',
    '      if (savedPaths.length > 0) {',
    r'        messageBody += "\n\n[System: Inbound media files saved to disk: " + savedPaths.join(", ") + ". Use feishu_bitable upload_attachment with file_path to upload to a bitable attachment field.]";',
    '      }',
    '    }',
    '',
]

patch_code = "\n".join(patch_lines) + "\n"
content = content.replace(target, patch_code + target, 1)

with open(path, "w") as f:
    f.write(content)

# Verify
with open(path, "r") as f:
    for i, line in enumerate(f, 1):
        if "savedPaths.join" in line:
            print(f"OK: patch applied at line {i}")
            break
    else:
        print("WARNING: patch line not found after write")
        sys.exit(1)

print("bot-media-path patch applied successfully")
