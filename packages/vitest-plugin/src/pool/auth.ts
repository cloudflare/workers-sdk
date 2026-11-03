import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
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

/**
 * Set up cf authentication using the profile associated with `profileDir`.
 */
function createAuth(profileDir: string, logger: Logger): CloudflareAuth {
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
			return inputPrompt<string>({
				type: "select",
				question,
				label: "Account",
				options: options.choices.map((choice) => ({
					label: choice.title,
					value: choice.value,
				})),
				throwOnError: true,
			});
		},
		isNoDefaultValueProvidedError: (error: unknown) =>
			error instanceof AccountSelectionUnavailable,
	};
	const auth = createCfAuth(context);
	const profileStore = createCfProfileStore({ logger });
	auth.setProfile(profileStore.resolve({ cwd: profileDir }));
	return auth;
}

/**
 * Get the cf credentials for a `cloudflare.config.ts` remote bindings session.
 *
 * @param profileDir Directory used to resolve the cf auth profile.
 * @param accountId The configured account ID, if any.
 * @param logger Logger for the auth flow.
 * @returns A hook resolving the account ID and API token, with a key
 * identifying those credentials.
 */
export function getRemoteBindingsAuth(
	profileDir: string,
	accountId: string | undefined,
	logger: Logger
): RemoteBindingsAuth {
	let auth: CloudflareAuth | undefined;
	return {
		hook: async () => {
			// Only resolve the profile once a session actually needs credentials
			auth ??= createAuth(profileDir, logger);
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
