import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import {
	createWranglerAuth,
	createWranglerProfileStore,
} from "@cloudflare/workers-auth/wrangler";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { version as packageVersion } from "../../package.json";
import type { RemoteBindingsAuth } from "@cloudflare/remote-bindings";
import type { CloudflareAuth } from "@cloudflare/workers-auth/cf";
import type { Logger } from "@cloudflare/workers-utils";

class AccountSelectionUnavailable extends Error {
	constructor() {
		super(
			"Cannot select an account while Vitest is running in a non-interactive context."
		);
	}
}

/** Which CLI's credentials a config uses: cf's or Wrangler's. */
type AuthTarget = "cf" | "wrangler";

// Pool workers and watch-mode reruns share each resolved profile's auth for the
// life of the process.
const authByProfileKey = new Map<string, CloudflareAuth>();

/**
 * Set up cf or Wrangler authentication using an already-resolved profile.
 */
function createAuthForProfile(
	target: AuthTarget,
	profile: string,
	logger: Logger
): CloudflareAuth {
	const context = {
		logger,
		userAgent: `vitest-plugin/${packageVersion}`,
		async prompt(question: string) {
			if (isNonInteractiveOrCI()) {
				throw new AccountSelectionUnavailable();
			}
			return inputPrompt<string>({
				type: "text",
				question,
				label: "Answer",
				throwOnError: true,
			});
		},
		async select(
			question: string,
			options: { choices: { title: string; value: string }[] }
		) {
			if (isNonInteractiveOrCI()) {
				throw new AccountSelectionUnavailable();
			}
			const accountId = await inputPrompt<string>({
				type: "select",
				question,
				label: "Account",
				options: options.choices.map((choice) => ({
					label: choice.title,
					value: choice.value,
				})),
				throwOnError: true,
			});
			if (target === "cf") {
				logger.info(
					[
						"To use this account automatically in future, configure accountId in cloudflare.config.ts:",
						"",
						`  accountId: ${JSON.stringify(accountId)},`,
						"",
						"Alternatively, set the `CLOUDFLARE_ACCOUNT_ID` environment variable.",
					].join("\n")
				);
			}
			return accountId;
		},
		isNoDefaultValueProvidedError: (error: unknown) =>
			error instanceof AccountSelectionUnavailable,
	};
	const auth =
		target === "cf" ? createCfAuth(context) : createWranglerAuth(context);
	auth.setProfile(profile);
	return auth;
}

function getAuth(
	target: AuthTarget,
	profileDir: string,
	profile: string,
	logger: Logger
): CloudflareAuth {
	const key = JSON.stringify([target, profileDir, profile]);
	let auth = authByProfileKey.get(key);
	if (!auth) {
		auth = createAuthForProfile(target, profile, logger);
		authByProfileKey.set(key, auth);
	}
	return auth;
}

/**
 * Get the credentials for a remote bindings session: cf's for a
 * `cloudflare.config.ts`, Wrangler's for a Wrangler config.
 *
 * @param target Which CLI's credentials the config uses.
 * @param profileDir Directory used to resolve the auth profile.
 * @param accountId The configured account ID, if any.
 * @param logger Logger for the auth flow.
 * @returns A hook resolving the account ID and API token, with a key
 * identifying those credentials.
 */
export function getRemoteBindingsAuth(
	target: AuthTarget,
	profileDir: string,
	accountId: string | undefined,
	logger: Logger
): RemoteBindingsAuth {
	const profileStore =
		target === "cf"
			? createCfProfileStore({ logger })
			: createWranglerProfileStore({ logger });
	const profile = profileStore.resolve({ cwd: profileDir });
	return {
		hook: async () => {
			const auth = getAuth(target, profileDir, profile, logger);
			return {
				accountId: await auth.requireAuth(
					accountId ? { account_id: accountId } : {}
				),
				apiToken: auth.requireApiToken(),
			};
		},
		key: JSON.stringify([profileDir, accountId, profile]),
	};
}
