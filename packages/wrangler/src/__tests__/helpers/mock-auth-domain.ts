import { afterEach, beforeEach } from "vitest";

const ORIGINAL_CLOUDFLARE_AUTH_DOMAIN = process.env.CLOUDFLARE_AUTH_DOMAIN;

/**
 * Mock the Auth URL domain so that we can control where we attempt to login.
 *
 * Note that you can remove any API token from the environment by setting the value to `null`.
 * This is useful if a higher `describe()` block has already called `mockAuthDomain()`.
 */
export function mockAuthDomain({ domain }: { domain: string | null }) {
	beforeEach(() => {
		if (domain === null) {
			delete process.env.CLOUDFLARE_AUTH_DOMAIN;
		} else {
			process.env.CLOUDFLARE_AUTH_DOMAIN = domain;
		}
	});
	afterEach(() => {
		process.env.CLOUDFLARE_AUTH_DOMAIN = ORIGINAL_CLOUDFLARE_AUTH_DOMAIN;
	});
}
