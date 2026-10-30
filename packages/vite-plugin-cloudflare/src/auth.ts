import { createRequire } from "node:module";
import { format } from "node:util";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { debuglog } from "./utils";
import type { CloudflareAuth } from "@cloudflare/workers-auth/cf";
import type { AsyncHook, CfAccount, Logger } from "@cloudflare/workers-utils";
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
	const profile = createCfProfileStore({ logger }).resolve({ cwd: profileDir });
	return createAuthForProfile(profile, logger);
}

function createAuthForProfile(profile: string, logger: Logger): CloudflareAuth {
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
	auth.setProfile(profile);
	return auth;
}

/**
 * Get the cf auth hook for remote bindings sessions.
 *
 * Hooks are cached because `maybeStartOrUpdateRemoteProxySession()` restarts
 * the session whenever it receives a different hook. A changed profile needs
 * a new hook so that the session uses the newly selected credentials.
 *
 * @param hooks - Hook cache that persists across Vite server restarts.
 * @param profileDir - Directory used to resolve the cf auth profile.
 * @param accountId - The configured account ID, if any.
 * @param logger - Logger for the auth flow.
 * @returns A hook resolving the account ID and API token for the session.
 */
export function getRemoteBindingsAuth(
	hooks: Map<string, AsyncHook<CfAccount>>,
	profileDir: string,
	accountId: string | undefined,
	logger: Logger
): AsyncHook<CfAccount> {
	const profile = createCfProfileStore({ logger }).resolve({ cwd: profileDir });
	const key = JSON.stringify([profileDir, accountId, profile]);
	let hook = hooks.get(key);
	if (hook === undefined) {
		let auth: CloudflareAuth | undefined;
		hook = async () => {
			// Only initialize authentication once a session actually needs credentials
			auth ??= createAuthForProfile(profile, logger);
			return {
				accountId: await auth.requireAuth(
					accountId ? { account_id: accountId } : {}
				),
				apiToken: auth.requireApiToken(),
			};
		};
		hooks.set(key, hook);
	}
	return hook;
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
