/**
 * Generates AGENTS.md content for Cloudflare Workers projects.
 *
 * This file is injected into new Workers projects created via create-cloudflare
 * to provide AI coding agents with retrieval-led guidance for Cloudflare APIs.
 *
 * Keep the Local Explorer endpoint list in sync with:
 * - packages/wrangler/src/dev/start-dev.ts (printLocalExplorerAgentHint)
 * - packages/vite-plugin-cloudflare/src/plugins/agent-hint.ts (printLocalExplorerAgentHint)
 *
 * @returns The AGENTS.md content as a string
 */
export const getAgentsMd = (): string => `# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: \`https://docs.mcp.cloudflare.com/mcp\`

For all limits and quotas, retrieve from the product's \`/platform/limits/\` page. eg. \`/workers/platform/limits\`

## Commands

| Command | Purpose |
|---------|---------|
| \`npx wrangler dev\` | Local development |
| \`npx wrangler deploy\` | Deploy to Cloudflare |
| \`npx wrangler types\` | Generate TypeScript types |

Run \`wrangler types\` after changing bindings in wrangler.jsonc.

## Local Explorer (Debugging & Inspection)

When running \`npx wrangler dev\`, a Local Explorer API is available for inspecting and debugging local Workers, bindings, and storage state. The API base URL is printed in the terminal when the dev server starts.

Key endpoints (relative to the dev server URL):

| Endpoint | Description |
|----------|-------------|
| \`GET /cdn-cgi/local/explorer/api/local/workers\` | List local Workers and their bindings |
| \`GET /cdn-cgi/local/explorer/api/storage/kv/namespaces\` | List KV namespaces |
| \`GET /cdn-cgi/local/explorer/api/d1/database\` | List D1 databases |
| \`GET /cdn-cgi/local/explorer/api/r2/buckets\` | List R2 buckets |
| \`GET /cdn-cgi/local/explorer/api/workers/durable_objects/namespaces\` | List Durable Object namespaces |
| \`GET /cdn-cgi/local/explorer/api/workflows\` | List Workflows |
| \`POST /cdn-cgi/local/explorer/api/local/observability/query\` | Run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: \`spans\`, \`logs\` (read attributes via \`json(attributes)\`). Example: \`curl -X POST <base>/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'\` |
| \`POST /cdn-cgi/local/explorer/api/local/observability/clear\` | Clear all captured traces and logs |

If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort): \`GET /cdn-cgi/local/explorer/api\`

Use the Local Explorer to debug issues by inspecting storage state (KV keys, D1 rows, R2 objects, DO storage), viewing Worker bindings, and querying request traces and logs captured during the dev session.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from \`/workers/platform/limits/\`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
\`/kv/\` · \`/r2/\` · \`/d1/\` · \`/durable-objects/\` · \`/queues/\` · \`/vectorize/\` · \`/workers-ai/\` · \`/agents/\`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
`;
