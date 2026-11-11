import { createWranglerProfileStore } from "@cloudflare/workers-auth/wrangler";
import { logger } from "../../logger";
import { createAuthForProfile } from "../../user";
import type { RemoteBindingsAuth } from "@cloudflare/remote-bindings";
import type { CloudflareAuth } from "@cloudflare/workers-auth/cf";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Get Wrangler's credentials for a remote proxy session started through
 * Wrangler's API without `auth`.
 *
 * API callers never select a Wrangler profile, so resolve it from `profileDir`.
 *
 * @param accountId - The configured account ID, if any.
 * @param profileDir - Directory used to resolve the auth profile from directory bindings.
 * @returns A hook resolving the account ID and API token, with a key
 * identifying those credentials.
 */
export function getDefaultRemoteBindingsAuth(
	accountId: Config["account_id"] | undefined,
	profileDir = process.cwd()
): RemoteBindingsAuth {
	let auth: CloudflareAuth | undefined;
	return {
		hook: async () => {
			// Resolve the profile only once a session needs credentials
			auth ??= createAuthForProfile(
				createWranglerProfileStore({ logger }).resolve({ cwd: profileDir })
			);
			return {
				accountId: await auth.requireAuth(
					accountId ? { account_id: accountId } : {}
				),
				apiToken: auth.requireApiToken(),
			};
		},
		key: JSON.stringify([profileDir, accountId]),
	};
}
