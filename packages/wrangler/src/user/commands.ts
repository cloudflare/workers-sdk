import { CommandLineArgsError, UserError } from "@cloudflare/workers-utils";
import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { getActiveProfileName, getProfileForDirectory } from "./profiles";
import {
	getAuthFromEnv,
	getOAuthTokenFromLocalState,
	listScopes,
	login,
	logout,
	validateScopeKeys,
	type Scope,
} from "./user";
import { whoami } from "./whoami";

/**
 * Represents the authentication information returned by `wrangler auth token --json`.
 */
export type AuthTokenInfo =
	| { type: "oauth"; token: string }
	| { type: "api_token"; token: string }
	| { type: "api_key"; key: string; email: string };

export const loginArgs = {
	browser: {
		default: true,
		type: "boolean",
		describe: "Automatically open the OAuth link in a browser",
	},
	scopes: {
		describe: "Pick the set of applicable OAuth scopes when logging in",
		array: true,
		type: "string",
		requiresArg: true,
	},
	"scopes-list": {
		describe: "List all the available OAuth scopes with descriptions",
	},
	"callback-host": {
		describe:
			"Use the ip or host address for the temporary login callback server.",
		type: "string",
		requiresArg: false,
		default: "localhost",
	},
	"callback-port": {
		describe: "Use the port for the temporary login callback server.",
		type: "number",
		requiresArg: false,
		default: 8976,
	},
} as const;

/**
 * Handle `--scopes-list` and `--scopes` validation.
 * Returns `true` when the caller should return early (scopes were listed or empty).
 */
export function handleScopesArgs(args: {
	scopesList?: unknown;
	scopes?: string[];
}): boolean {
	if (args.scopesList) {
		listScopes();
		return true;
	}
	if (args.scopes) {
		if (args.scopes.length === 0) {
			listScopes();
			return true;
		}
		if (!validateScopeKeys(args.scopes)) {
			throw new CommandLineArgsError(
				`One of ${args.scopes} is not a valid authentication scope. Run "wrangler login --scopes-list" to see the valid scopes.`,
				{ telemetryMessage: "user login invalid scope" }
			);
		}
	}
	return false;
}

export const loginCommand = createCommand({
	metadata: {
		description: "🔓 Login to Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
		printActiveProfile: false,
	},
	args: {
		...loginArgs,
	},
	async handler(args, { config }) {
		if (handleScopesArgs(args)) {
			return;
		}

		const currentProfile = getActiveProfileName();
		if (currentProfile !== "default") {
			const message = getProfileForDirectory()
				? `This directory is bound to the auth profile "${currentProfile}\n"`
				: `You are currently using the auth profile "${currentProfile}\n".`;
			logger.error(
				message,
				"If you want to create a new auth profile, run `wrangler profiles create <profile name>`.\n",
				"If you want to switch to an existing auth profile, run `wrangler profiles set <profile name>`.\n"
			);
			return;
		}

		await login(config, {
			scopes: args.scopes as Scope[] | undefined,
			browser: args.browser,
			callbackHost: args.callbackHost,
			callbackPort: args.callbackPort,
		});

		metrics.sendMetricsEvent("login user", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const logoutCommand = createCommand({
	metadata: {
		description: "🚪 Logout from Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
		printActiveProfile: false,
		provideConfig: false,
	},
	async handler() {
		await logout();

		try {
			// If the config file is invalid then we default to not sending metrics.
			// TODO: Clean this up as part of a general config refactor.
			// See https://github.com/cloudflare/workers-sdk/issues/10682.
			const config = readConfig({}, { hideWarnings: true });
			metrics.sendMetricsEvent("logout user", {
				sendMetrics: config.send_metrics,
			});
		} catch (e) {
			logger.debug("Could not read config to send logout metrics.", e);
		}
	},
});

export const whoamiCommand = createCommand({
	metadata: {
		description: "🕵️ Retrieve your user information",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
	},
	behaviour: {
		printBanner: (args) => !args.json,
		printConfigWarnings: false,
	},
	args: {
		account: {
			type: "string",
			describe:
				"Show membership information for the given account (id or name).",
		},
		json: {
			type: "boolean",
			describe:
				"Return user information as JSON. Exits with a non-zero status if not authenticated.",
			default: false,
		},
	},
	async handler(args, { config }) {
		await whoami(config, args.account, undefined, args.json);
		metrics.sendMetricsEvent("view accounts", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const authNamespace = createNamespace({
	metadata: {
		description: "🔐 Manage authentication",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
	},
});

export const authTokenCommand = createCommand({
	metadata: {
		description: "🔑 Retrieve the current authentication token or credentials",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: (args) => !args.json,
		printConfigWarnings: false,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as JSON with token type information",
			default: false,
		},
	},
	async handler({ json }, { config }) {
		const authFromEnv = getAuthFromEnv();

		let result: AuthTokenInfo;

		if (authFromEnv) {
			if ("apiToken" in authFromEnv) {
				// API token from CLOUDFLARE_API_TOKEN
				result = { type: "api_token", token: authFromEnv.apiToken };
			} else {
				// Global API key + email from CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
				result = {
					type: "api_key",
					key: authFromEnv.authKey,
					email: authFromEnv.authEmail,
				};
			}
		} else {
			// OAuth token from local state (wrangler login)
			const token = await getOAuthTokenFromLocalState();
			if (!token) {
				throw new UserError(
					"Not logged in. Please run `wrangler login` to authenticate.",
					{ telemetryMessage: "user auth token not logged in" }
				);
			}
			result = { type: "oauth", token };
		}

		if (json) {
			logger.log(JSON.stringify(result, null, 2));
		} else {
			// For non-JSON output, only output a single token for scripting
			if (result.type === "api_key") {
				throw new UserError(
					"Cannot output a single token when using CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL.\n" +
						"Use --json to get both key and email, or use CLOUDFLARE_API_TOKEN instead.",
					{
						telemetryMessage: "user auth token unsupported credentials output",
					}
				);
			}
			logger.log(result.token);
		}

		metrics.sendMetricsEvent("retrieve auth token", {
			sendMetrics: config.send_metrics,
		});
	},
});
