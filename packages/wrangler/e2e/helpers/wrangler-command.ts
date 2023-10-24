import assert from "node:assert";

assert(
	process.env.CLOUDFLARE_ACCOUNT_ID,
	"Please provide a CLOUDFLARE_ACCOUNT_ID as an environment variable"
);

export const WRANGLER =
	process.env.WRANGLER ?? `pnpm --silent dlx wrangler@beta`;
