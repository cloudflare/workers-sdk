/**
 * AGENTS.md content for Cloudflare Workers projects.
 *
 * This file is injected into new Workers projects created via create-cloudflare
 * to provide AI coding agents with retrieval-led guidance for Cloudflare APIs.
 */

const getCurrentDate = (): string => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

export const getAgentsMd = (): string => `# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: \`https://docs.mcp.cloudflare.com/mcp\`

For all limits and quotas, retrieve from the product's \`/platform/limits/\` page.

## Commands

| Command | Purpose |
|---------|---------|
| \`npx wrangler dev\` | Local development |
| \`npx wrangler deploy\` | Deploy to Cloudflare |
| \`npx wrangler types\` | Generate TypeScript types |

Run \`wrangler types\` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

If you encounter \`Dynamic require of "X" is not supported\` or missing Node.js APIs:

\`\`\`jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "compatibility_date": "${getCurrentDate()}"
}
\`\`\`

Docs: https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from \`/workers/platform/limits/\`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
\`/kv/\` · \`/r2/\` · \`/d1/\` · \`/durable-objects/\` · \`/queues/\` · \`/vectorize/\` · \`/workers-ai/\` · \`/agents/\`
`;
