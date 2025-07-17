if (!process.env.WRANGLER) {
	console.warn(
		"No `WRANGLER` process environment variable provided - running local build of Wrangler"
	);
}
if (!process.env.WRANGLER_IMPORT) {
	console.warn(
		"No `WRANGLER_IMPORT` process environment variable provided - importing from the local build of Wrangler"
	);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.warn(
		"No `CLOUDFLARE_ACCOUNT_ID` variable provided, skipping API tests"
	);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.warn(
		"No `CLOUDFLARE_API_TOKEN` variable provided, skipping API tests"
	);
}

// Exporting noop vitest setup function allows it to be loaded as a setup file.
export const setup = () => {};
