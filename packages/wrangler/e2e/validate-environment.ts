import assert from "node:assert";

assert(
	process.env.WRANGLER,
	'You must provide a way to run Wrangler (WRANGLER="pnpm --silent dlx wrangler@beta" will run the latest beta)'
);

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.warn(
		"No CLOUDFLARE_ACCOUNT_ID variable provided, skipping API tests"
	);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.warn("No CLOUDFLARE_API_TOKEN variable provided, skipping API tests");
}

export const setup = () => {};
