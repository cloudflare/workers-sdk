FROM node:18

WORKDIR /wrangler

RUN npm i -g pnpm@8

RUN cd /wrangler

COPY . /wrangler

RUN pnpm install --frozen-lockfile

RUN pnpm -w build

RUN cd /wrangler/packages/wrangler

ENTRYPOINT CLOUDFLARE_ACCOUNT_ID=8d783f274e1f82dc46744c297b015a2f CLOUDFLARE_API_TOKEN=$CLOUDFLARE_TESTING_API_TOKEN WRANGLER="node --no-warnings /wrangler/packages/wrangler/wrangler-dist/cli.js" WRANGLER_IMPORT="/wrangler/packages/wrangler/wrangler-dist/cli.js" pnpm run test:e2e
