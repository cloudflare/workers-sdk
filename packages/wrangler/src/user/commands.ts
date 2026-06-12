import { CommandLineArgsError, UserError } from "@cloudflare/workers-utils";
import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import {
	DefaultScopeKeys,
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
		suggestSkillsAfterHandler: true,
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
		"experimental-device": {
			describe:
				"(Experimental) Use the OAuth 2.0 Device Authorization Grant (RFC 8628) instead of the localhost callback flow. Useful in containers, remote SSH sessions, or other environments where localhost:8976 is unreachable from your browser.",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		if (args.scopesList) {
			listScopes();
			return;
		}
		// `--callback-host` / `--callback-port` configure the temporary local
		// callback server used by the authorization-code flow. The device
		// authorization flow has no callback server, so the combination is
		// invalid rather than merely ignored.
		if (
			args.experimentalDevice &&
			(args.callbackHost !== "localhost" || args.callbackPort !== 8976)
		) {
			throw new CommandLineArgsError(
				"`--callback-host` and `--callback-port` cannot be used with `--experimental-device`; the device authorization flow does not use a local callback server.",
				{
					telemetryMessage:
						"user login callback args incompatible with device flow",
				}
			);
		}
		if (args.scopes) {
			if (args.scopes.length === 0) {
				// don't allow no scopes to be passed, that would be weird
				listScopes();
				return;
			}
			if (!validateScopeKeys(args.scopes)) {
				const validSet = new Set<string>(DefaultScopeKeys);
				const invalidScopes = args.scopes.filter((s) => !validSet.has(s));
				throw new CommandLineArgsError(
					`Invalid authentication scope${invalidScopes.length > 1 ? "s" : ""}: ${invalidScopes.map((s) => `"${s}"`).join(", ")}. Run "wrangler login --scopes-list" to see all valid scopes.`,
					{ telemetryMessage: "user login invalid scope" }
				);
			}
			await login(config, {
				scopes: args.scopes,
				browser: args.browser,
				callbackHost: args.callbackHost,
				callbackPort: args.callbackPort,
				device: args.experimentalDevice,
			});
			return;
		}
		await login(config, {
			browser: args.browser,
			callbackHost: args.callbackHost,
			callbackPort: args.callbackPort,
			device: args.experimentalDevice,
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
		provideConfig: false,
		suggestSkillsAfterHandler: true,
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
		suggestSkillsAfterHandler: (args) => !args.json,
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
		suggestSkillsAfterHandler: (args) => !args.json,
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
