import { createRequire } from "node:module";
import { format } from "node:util";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { debuglog } from "./utils";
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
	const profileStore = createCfProfileStore({ logger });
	auth.setProfile(profileStore.resolve({ cwd: profileDir }));
	return auth;
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
