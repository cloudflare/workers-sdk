# Keep the Node.js version aligned with volta.node in package.json.
FROM node:22.22.1-bookworm

ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    TURBO_CACHE=local:rw

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates git libatomic1 libc++1 python3 \
    && rm -rf /var/lib/apt/lists/*

# The scanner expects the complete checkout, including test fixtures, at /src.
COPY . /src
WORKDIR /src

# Corepack reads the pnpm version from packageManager in package.json.
RUN corepack enable && corepack prepare --activate
RUN pnpm install --frozen-lockfile

# Browser tests must not need downloads after the scanner disables networking.
RUN pnpm --filter @vite-plugin-cloudflare/playground exec playwright install --with-deps chromium
RUN pnpm build --filter='./packages/*' --concurrency=4

# Exercise the runtime and populate Miniflare's separate Chrome cache while online.
RUN pnpm --filter miniflare exec vitest run \
    test/loopback-auth.spec.ts \
    test/dev-registry-auth.spec.ts \
    test/workers/email-input-validation.spec.ts
RUN pnpm --filter miniflare exec vitest run test/plugins/browser/index.spec.ts \
    --testNamePattern='it creates a browser session'
RUN pnpm --filter @cloudflare/workers-auth test:ci \
    && pnpm --filter @cloudflare/kv-asset-handler test:ci
