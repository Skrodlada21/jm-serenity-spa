#!/bin/bash
# Deploy J&M Serenity Spa — the Raspberry Pi is home base.
# Run this ON THE PI, from ~/jm-serenity-spa, after editing files here.
# It validates, installs any new deps, restarts the app, and pushes to
# GitHub for backup. The Mac is not involved.
#
# Usage: ./deploy.sh "commit message"

set -e
cd "$(dirname "$0")"

echo "=== Syntax check ==="
node --check server.js

echo "=== Install dependencies (if package.json/lock changed) ==="
npm install --omit=dev

echo "=== Restart app ==="
pm2 restart spa
sleep 2
pm2 status spa

echo "=== Back up to GitHub ==="
git add -A
git commit -m "${1:-Update}" || echo "Nothing to commit"
git push

echo ""
echo "=== Done. Live at https://jmserenityspa.com ==="
