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

/**
 * Worker-name prefix covered by a wildcard Cloudflare Access application on
 * the e2e account's workers.dev subdomain. The CI account has an Access app
 * for `wrangler-wildcard-test-*.devprod-testing7928.workers.dev`, which
 * requires an interactive login.
 *
 * When running against another account (`E2E_ACCOUNT_WORKERS_DEV_DOMAIN`),
 * set `E2E_ACCESS_WORKER_PREFIX` to a matching prefix on that account, or the
 * Access tests are skipped.
 */
export const E2E_ACCESS_WORKER_PREFIX =
	process.env.E2E_ACCESS_WORKER_PREFIX ??
	(process.env.E2E_ACCOUNT_WORKERS_DEV_DOMAIN === undefined
		? "wrangler-wildcard-test-"
		: undefined);
