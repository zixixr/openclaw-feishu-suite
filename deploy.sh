#!/bin/bash
# Deploy custom plugins and patches to OpenClaw VM.
# Safe to re-run: idempotent for both plugins and patches.
#
# Usage:
#   ./deploy.sh                  # deploy everything
#   ./deploy.sh plugins          # deploy plugins only
#   ./deploy.sh patches          # apply patches only
#   ./deploy.sh restart          # just restart gateway

set -euo pipefail

VM="azureuser@20.194.30.206"
CONTAINER="openclaw-gateway"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Plugins ---
deploy_plugins() {
  echo "=== Deploying plugins ==="
  for p in feishu-bitable feishu-permission feishu-contacts feishu-messaging \
           feishu-calendar feishu-task feishu-sheets feishu-doc-enhanced anthropic-auth; do
    local src="$SCRIPT_DIR/plugins/$p"
    if [ ! -d "$src" ]; then
      echo "  SKIP $p (not found locally)"
      continue
    fi
    echo "  -> $p"
    scp -q -r "$src"/* "$VM:~/.openclaw/extensions/$p/"
  done
  echo "  Plugins deployed."
}

# --- Patches (applied inside running container) ---
apply_patches() {
  echo "=== Applying patches ==="
  for patch in "$SCRIPT_DIR"/patches/*.py; do
    [ -f "$patch" ] || continue
    local name=$(basename "$patch")
    echo "  -> $name"
    scp -q "$patch" "$VM:/tmp/$name"
    ssh "$VM" "docker cp /tmp/$name $CONTAINER:/tmp/$name && docker exec $CONTAINER python3 /tmp/$name"
  done
  echo "  Patches applied."
}

# --- Restart ---
restart_gateway() {
  echo "=== Restarting gateway ==="
  ssh "$VM" "docker restart $CONTAINER"
  sleep 5
  echo "  Checking for errors..."
  ssh "$VM" "docker logs --tail 5 $CONTAINER 2>&1 | grep -i error || echo '  No errors.'"
  echo "  Gateway restarted."
}

# --- Main ---
case "${1:-all}" in
  plugins)
    deploy_plugins
    restart_gateway
    ;;
  patches)
    apply_patches
    restart_gateway
    ;;
  restart)
    restart_gateway
    ;;
  all|"")
    deploy_plugins
    apply_patches
    restart_gateway
    ;;
  *)
    echo "Usage: $0 [plugins|patches|restart|all]"
    exit 1
    ;;
esac

echo "=== Done ==="
