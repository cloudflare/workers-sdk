export const CLOUDFLARE_ACCOUNT_ID = process.env
	.CLOUDFLARE_ACCOUNT_ID as string;

/**
 * The workers.dev subdomain for the account used by e2e tests.
 *
 * Set the `E2E_ACCOUNT_WORKERS_DEV_DOMAIN` environment variable to run the
 * tests against a different account (e.g. your personal account's subdomain).
 */
export const E2E_ACCOUNT_WORKERS_DEV_DOMAIN =
	process.env.E2E_ACCOUNT_WORKERS_DEV_DOMAIN ??
	"devprod-testing7928.workers.dev";
