import assert from "node:assert";

assert(
	process.env.WRANGLER,
	'You must provide a way to run Wrangler (WRANGLER="pnpm --silent dlx wrangler@beta" will run the latest beta)'
);

assert(
	process.env.CLOUDFLARE_ACCOUNT_ID,
	"You must provide a CLOUDFLARE_ACCOUNT_ID as an environment variable"
);

assert(
	process.env.CLOUDFLARE_API_TOKEN,
	"You must provide a CLOUDFLARE_API_TOKEN as an environment variable"
);

assert(
	process.env.CLOUDFLARE_ACCOUNT_ID === "8d783f274e1f82dc46744c297b015a2f",
	"You must run Wrangler's e2e tests against DevProd Testing"
);

export const setup = () => {};
