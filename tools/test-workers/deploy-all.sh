#!/bin/bash
set -e

echo "Deploying test workers..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR/existing-script-test-do-not-delete"

if ! curl -s -o /dev/null -w "%{http_code}" https://existing-script-test-do-not-delete.devprod-testing7928.workers.dev | grep -q "200"; then
  echo "Worker 'existing-script-test-do-not-delete' does not exist or is not responding, deploying..."
  npx wrangler@latest deploy
else
  echo "Worker 'existing-script-test-do-not-delete' already exists and is responding, skipping deployment"
fi

echo "Test worker deployment complete"
