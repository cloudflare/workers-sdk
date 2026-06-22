#!/usr/bin/env bash
#
# Build the experimental local-dev observability feature from this fork so you
# can run it against your own Worker. See OBSERVABILITY.md for usage details.
#
# Requirements: Node.js >= 20 and pnpm.
#
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Installing dependencies (pnpm install)…"
pnpm install

echo "==> Building wrangler + @cloudflare/vite-plugin (and their deps:"
echo "    miniflare, local-explorer-ui, …) — this can take a few minutes…"
pnpm turbo build --filter=wrangler --filter=@cloudflare/vite-plugin

WRANGLER_BIN="$(pwd)/packages/wrangler/bin/wrangler.js"

cat <<DONE

✅  Build complete.

Run your Worker with local observability (wrangler dev):

    cd /path/to/your-worker
    node "$WRANGLER_BIN" dev --experimental-observability

Then open the Local Explorer and click the Observability tab:

    http://localhost:8787/cdn-cgi/explorer/

Tip — alias it for the session:

    alias wrx='node "$WRANGLER_BIN"'
    wrx dev --experimental-observability

Vite users: see OBSERVABILITY.md ("Vite" section) — symlink this build into your
app's node_modules, then run:  X_LOCAL_OBSERVABILITY=true vite dev

DONE
