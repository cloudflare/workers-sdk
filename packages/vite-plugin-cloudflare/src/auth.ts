import { format } from "node:util";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import {
	createWranglerAuth,
	createWranglerProfileStore,
} from "@cloudflare/workers-auth/wrangler";
import { isNonInteractiveOrCI, UserError } from "@cloudflare/workers-utils";
import { version as packageVersion } from "../package.json";
import { debuglog } from "./utils";
import type { Logger } from "@cloudflare/workers-utils";
import type * as vite from "vite";

class NoDefaultValueProvided extends UserError {
	constructor() {
		super("This command cannot be run in a non-interactive context", {
			telemetryMessage: "vite auth prompt default missing",
		});
	}
}

export const USER_AGENT = `vite-plugin/${packageVersion}`;

/**
 * Use the same auth selection and profile setup as remote bindings so Vite
 * features share credentials regardless of how Vite was started.
 */
export function createAuth(profileDir: string, logger: Logger) {
	const context = {
		logger,
		userAgent: USER_AGENT,
		async prompt(question: string) {
			if (isNonInteractiveOrCI()) {
				throw new NoDefaultValueProvided();
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
				throw new NoDefaultValueProvided();
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
			error instanceof NoDefaultValueProvided,
	};
	const useCfAuth = "CLOUDFLARE_CF_AUTH" in process.env;
	const auth = useCfAuth ? createCfAuth(context) : createWranglerAuth(context);
	const profileStore = useCfAuth
		? createCfProfileStore({ logger })
		: createWranglerProfileStore({ logger });
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
