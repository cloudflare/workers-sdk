import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { version as packageVersion } from "../package.json";
import type { HarnessContext } from "./runtime";
import type { RemoteBindingsAuth } from "@cloudflare/remote-bindings";
import type { CloudflareAuth } from "@cloudflare/workers-auth/cf";
import type { Logger } from "@cloudflare/workers-utils";

class AccountSelectionUnavailable extends Error {
	constructor() {
		super("Cannot select an account in a non-interactive context.");
	}
}

/**
 * Set up cf authentication using an already-resolved profile.
 */
function createAuthForProfile(profile: string, logger: Logger): CloudflareAuth {
	const context = {
		logger,
		userAgent: `test-harness/${packageVersion}`,
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
			logger.info(
				[
					"To use this account automatically in future, configure accountId in cloudflare.config.ts and rebuild:",
					"",
					`  accountId: ${JSON.stringify(accountId)},`,
					"",
					"Alternatively, set the `CLOUDFLARE_ACCOUNT_ID` environment variable.",
				].join("\n")
			);
			return accountId;
		},
		isNoDefaultValueProvidedError: (error: unknown) =>
			error instanceof AccountSelectionUnavailable,
	};
	const auth = createCfAuth(context);
	auth.setProfile(profile);
	return auth;
}

/**
 * Get the cf credentials for a Build Output remote bindings session.
 *
 * @param ctx The harness's context, whose Workers share each profile's auth.
 * @param profileDir Directory used to resolve the cf auth profile.
 * @param accountId The configured account ID, if any.
 * @returns A hook resolving the account ID and API token, with a key
 * identifying those credentials.
 */
export function getRemoteBindingsAuth(
	ctx: HarnessContext,
	profileDir: string,
	accountId: string | undefined
): RemoteBindingsAuth {
	const profile = createCfProfileStore({ logger: ctx.logger }).resolve({
		cwd: profileDir,
	});
	return {
		hook: async () => {
			let auth = ctx.authByProfile.get(profile);
			if (!auth) {
				auth = createAuthForProfile(profile, ctx.logger);
				ctx.authByProfile.set(profile, auth);
			}
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
