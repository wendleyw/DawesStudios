#!/bin/sh
# Runs the dev server for phones on the same Wi-Fi: it listens on every interface, points the
# browser at the local Supabase API through this machine's network address, and lets Next serve its
# dev assets to that origin. Set LAN_IP to choose the address when the machine has several.
set -e
cd "$(dirname "$0")/.."
ip="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
if [ -z "$ip" ]; then
  echo "No network address found. Set LAN_IP=<this machine's Wi-Fi address>." >&2
  exit 1
fi
supabase_url="$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' .env.local)"
supabase_port="${supabase_url##*:}"
export NEXT_PUBLIC_SUPABASE_URL="http://$ip:${supabase_port:-55421}"
export DEV_ALLOWED_ORIGINS="$ip"
echo "Open http://$ip:3003 on a device on the same Wi-Fi."
exec npx next dev --hostname 0.0.0.0 --port 3003
