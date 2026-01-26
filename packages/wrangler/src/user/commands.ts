import { CommandLineArgsError, UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import {
	getAuthFromEnv,
	getOAuthTokenFromLocalState,
	listScopes,
	login,
	logout,
	validateScopeKeys,
} from "./user";
import { whoami } from "./whoami";

/**
 * Represents the authentication information returned by `wrangler auth token --json`.
 */
export type AuthTokenInfo =
	| { type: "oauth"; token: string }
	| { type: "api_token"; token: string }
	| { type: "api_key"; key: string; email: string };

export const loginCommand = createCommand({
	metadata: {
		description: "🔓 Login to Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	args: {
		"scopes-list": {
			describe: "List all the available OAuth scopes with descriptions",
		},
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
	},
	async handler(args, { config }) {
		if (args.scopesList) {
			listScopes();
			return;
		}
		if (args.scopes) {
			if (args.scopes.length === 0) {
				// don't allow no scopes to be passed, that would be weird
				listScopes();
				return;
			}
			if (!validateScopeKeys(args.scopes)) {
				throw new CommandLineArgsError(
					`One of ${args.scopes} is not a valid authentication scope. Run "wrangler login --scopes-list" to see the valid scopes.`
				);
			}
			await login(config, {
				scopes: args.scopes,
				browser: args.browser,
				callbackHost: args.callbackHost,
				callbackPort: args.callbackPort,
			});
			return;
		}
		await login(config, {
			browser: args.browser,
			callbackHost: args.callbackHost,
			callbackPort: args.callbackPort,
		});
		metrics.sendMetricsEvent("login user", {
			sendMetrics: config.send_metrics,
		});

		// TODO: would be nice if it optionally saved login
		// credentials inside node_modules/.cache or something
		// this way you could have multiple users on a single machine
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
	},
	async handler(_, { config }) {
		await logout();
		metrics.sendMetricsEvent("logout user", {
			sendMetrics: config.send_metrics,
		});
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
		printConfigWarnings: false,
	},
	args: {
		account: {
			type: "string",
			describe:
				"Show membership information for the given account (id or name).",
		},
	},
	async handler(args, { config }) {
		await whoami(config, args.account);
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
					"Not logged in. Please run `wrangler login` to authenticate."
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
						"Use --json to get both key and email, or use CLOUDFLARE_API_TOKEN instead."
				);
			}
			logger.log(result.token);
		}

		metrics.sendMetricsEvent("retrieve auth token", {
			sendMetrics: config.send_metrics,
		});
	},
});
