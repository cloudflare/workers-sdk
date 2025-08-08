# Test Workers

This directory contains worker definitions used by CI tests. Each worker has its own subdirectory containing:

- `index.js` - The worker script
- `wrangler.jsonc` - The worker configuration

## Workers

### existing-script-test-do-not-delete

Used by the C3 E2E tests for the `--existing-script` functionality. This worker:

- Has a variable `FOO` set to `"bar"`
- Returns "Hello World!" for all requests
- Is deployed to the DevProd Testing account before E2E tests run

## Local Testing

To test a worker locally:

```bash
cd tools/test-workers/existing-script-test-do-not-delete
npx wrangler@latest dev
```

To deploy a worker:

```bash
cd tools/test-workers/existing-script-test-do-not-delete
npx wrangler@latest deploy
```

## Deploying All Test Workers

To deploy all test workers at once (used by CI):

```bash
# From the repository root
node -r esbuild-register tools/test-workers/deploy-all.ts

# Or from the tools directory
cd tools
node -r esbuild-register test-workers/deploy-all.ts
```

The `deploy-all.ts` script:

- Checks for required environment variables (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- Verifies if workers already exist by checking their URLs
- Only deploys workers that don't exist or aren't responding
- Skips deployment gracefully if credentials are missing (useful for fork PRs)
