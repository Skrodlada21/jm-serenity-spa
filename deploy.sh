#!/bin/bash
# Deploy J&M Serenity Spa to Raspberry Pi
# Usage: ./deploy.sh  (or bash deploy.sh)

set -e

echo "=== Pushing to GitHub ==="
git add -A
git commit -m "${1:-Update}" || echo "Nothing to commit"
git push

echo ""
echo "=== Deploying to Pi ==="
ssh nick@192.168.7.5 "cd ~/jm-serenity-spa && git pull && pm2 restart spa"

echo ""
echo "=== Done! Site should be live at https://jmserenityspa.com ==="
