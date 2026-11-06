import { createRequire } from "node:module";
import { format } from "node:util";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { debuglog } from "./utils";
import type { RemoteBindingsAuth } from "@cloudflare/remote-bindings";
import type { CloudflareAuth } from "@cloudflare/workers-auth/cf";
import type { Logger } from "@cloudflare/workers-utils";
import type * as vite from "vite";

class AccountSelectionUnavailable extends Error {
	constructor() {
		super(
			"Cannot select an account while Vite is running in a non-interactive context."
		);
	}
}

const { version: packageVersion } = createRequire(import.meta.url)(
	"../package.json"
) as { version: string };

export const USER_AGENT = `vite-plugin/${packageVersion}`;

/**
 * Set up cf authentication using the profile associated with the Vite project.
 */
export function createAuth(profileDir: string, logger: Logger) {
	return createAuthForProfile(resolveAuthProfile(profileDir, logger), logger);
}

export function resolveAuthProfile(profileDir: string, logger: Logger): string {
	return createCfProfileStore({ logger }).resolve({ cwd: profileDir });
}

export function createAuthForProfile(
	profile: string,
	logger: Logger
): CloudflareAuth {
	const context = {
		logger,
		userAgent: USER_AGENT,
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
					"To use this account automatically in future, configure accountId in cloudflare.config.ts:",
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
 * Get the cf credentials for remote bindings sessions.
 *
 * The key includes the resolved profile so a profile change restarts the
 * session with the newly selected credentials.
 *
 * @param profileDir - Directory used to resolve the cf auth profile.
 * @param accountId - The configured account ID, if any.
 * @param getAuth - Returns the auth instance shared by this Vite project.
 * @returns A hook resolving the account ID and API token, with a key
 * identifying those credentials.
 */
export function getRemoteBindingsAuth(
	profileDir: string,
	accountId: string | undefined,
	getAuth: () => CloudflareAuth
): RemoteBindingsAuth {
	const auth = getAuth();
	return {
		hook: async () => {
			return {
				accountId: await auth.requireAuth(
					accountId ? { account_id: accountId } : {}
				),
				apiToken: auth.requireApiToken(),
			};
		},
		key: JSON.stringify([profileDir, accountId, auth.getActiveProfile()]),
	};
}

/** Adapt Vite's logger to the shared Cloudflare API logger interface. */
export function createLogger(logger: vite.Logger): Logger {
	return {
		debug: (message?: unknown, ...args: unknown[]) =>
			debuglog(format(message, ...args)),
		log: (message?: unknown, ...args: unknown[]) =>
			logger.info(format(message, ...args)),
		info: (message?: unknown, ...args: unknown[]) =>
			logger.info(format(message, ...args)),
		warn: (message?: unknown, ...args: unknown[]) =>
			logger.warn(format(message, ...args)),
		error: (message?: unknown, ...args: unknown[]) =>
			logger.error(format(message, ...args)),
	};
}
