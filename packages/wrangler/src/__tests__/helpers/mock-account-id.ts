import { afterEach, beforeEach, vi } from "vitest";
import { reinitialiseAuthTokens } from "../../user";

/**
 * Mock the API token so that we don't need to read it from user configuration files.
 *
 * Note that you can remove any API token from the environment by setting the value to `null`.
 * This is useful if a higher `describe()` block has already called `mockApiToken()`.
 */
export function mockApiToken({
	apiToken = "some-api-token",
}: { apiToken?: string | null } = {}) {
	beforeEach(() => {
		if (apiToken === null) {
			// stubEnv doesn't support removing env vars
			// So we fake it by initially stubbing it with an empty string and then deleting it
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
			delete process.env.CLOUDFLARE_API_TOKEN;
		} else {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", apiToken);
		}
		// Now we have updated the environment, we must reinitialize the user auth state.
		reinitialiseAuthTokens();
	});
}

/**
 * Mock the current account ID so that we don't need to read it from configuration files.
 *
 * Note that you can remove any account ID from the environment by setting the value to `null`.
 * This is useful if a higher `describe()` block has already called `mockAccountId()`.
 */
export function mockAccountId({
	accountId = "some-account-id",
}: { accountId?: string | null } = {}) {
	const ORIGINAL_CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
	beforeEach(() => {
		if (accountId === null) {
			delete process.env.CLOUDFLARE_ACCOUNT_ID;
		} else {
			process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
		}
		// Now we have updated the environment, we must reinitialize the user auth state.
		reinitialiseAuthTokens();
	});
	afterEach(() => {
		if (ORIGINAL_CLOUDFLARE_ACCOUNT_ID === undefined) {
			// `process.env`'s assigned property values are coerced to strings
			delete process.env.CLOUDFLARE_ACCOUNT_ID;
		} else {
			process.env.CLOUDFLARE_ACCOUNT_ID = ORIGINAL_CLOUDFLARE_ACCOUNT_ID;
		}
	});
}
