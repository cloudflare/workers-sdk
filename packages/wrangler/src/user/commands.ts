import { getCloudflareAuthUseKeyringFromEnv } from "@cloudflare/workers-auth";
import { CommandLineArgsError, UserError } from "@cloudflare/workers-utils";
import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { setKeyringPreference } from "./keyring-preference";
import { readUserPreferences } from "./preferences";
import {
	DefaultScopeKeys,
	getActiveProfile,
	getAuthFromEnv,
	getCredentialStore,
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

export const oauthArgs = {
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
} as const;

export const loginCommand = createCommand({
	metadata: {
		description: "🔓 Login to Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
		hideGlobalFlags: ["profile"],
	},
	behaviour: {
		printConfigWarnings: false,
		suggestSkillsAfterHandler: true,
	},
	args: {
		...oauthArgs,
		"scopes-list": {
			describe: "List all the available OAuth scopes with descriptions",
		},
		"use-keyring": {
			describe:
				"Store OAuth credentials in the OS keychain instead of a plaintext file (persisted across invocations)",
			type: "boolean",
			// Intentionally no `default`: the unset (tri-state `undefined`)
			// value means "flag not passed", which the handler distinguishes
			// from an explicit `--use-keyring` / `--no-use-keyring` so it only
			// touches the persisted preference when the user actually opts in
			// or out.
		},
	},
	validateArgs(args) {
		if (args.profile) {
			throw new CommandLineArgsError(
				"--profile cannot be used with the login command, as `wrangler login` is reserved for default, global auth. If you want to create or activate a named profile, run `wrangler auth create` or `wrangler auth activate`.",
				{
					telemetryMessage: "profile flag with login",
				}
			);
		}
	},
	async handler(args, { config }) {
		const activeProfile = getActiveProfile();
		if (activeProfile !== "default") {
			logger.warn(
				`This directory has profile "${activeProfile}" active. \`wrangler login\` updates the default profile, not "${activeProfile}".\n` +
					`To re-authenticate "${activeProfile}", run \`wrangler auth create ${activeProfile}\`.`
			);
		}

		if (args.scopesList) {
			listScopes();
			return;
		}

		// Persist `--use-keyring` / `--no-use-keyring` before doing the login
		// so the OAuth callback writes credentials to the requested backend.
		// Delegates to the same logic as `wrangler auth keyring enable|disable`
		// (env-override warning, opt-out scrub of all encrypted profiles, and
		// eager validation + rollback of an unusable opt-in).
		if (args.useKeyring !== undefined) {
			setKeyringPreference(args.useKeyring);
		}

		// Validate `--scopes` up front so we can share a single `login(...)`
		// call (and a single `sendMetricsEvent("login user", ...)` site) between
		// the scoped and unscoped paths.
		let scopes: typeof DefaultScopeKeys | undefined;
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
			scopes = args.scopes;
		}
		await login(config, {
			scopes,
			browser: args.browser,
			callbackHost: args.callbackHost,
			callbackPort: args.callbackPort,
			profile: "default",
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
		hideGlobalFlags: ["profile"],
	},
	behaviour: {
		printConfigWarnings: false,
		provideConfig: false,
		suggestSkillsAfterHandler: true,
	},
	validateArgs(args) {
		if (args.profile) {
			throw new CommandLineArgsError(
				"--profile cannot be used with the logout command, as `wrangler logout` is reserved for default, global auth. If you want to delete or deactivate a named profile, run `wrangler auth delete` or `wrangler auth deactivate`.",
				{
					telemetryMessage: "profile flag with logout",
				}
			);
		}
	},
	async handler() {
		const activeProfile = getActiveProfile();
		if (activeProfile !== "default") {
			logger.warn(
				`This directory has profile "${activeProfile}" active. \`wrangler logout\` removes the default profile's token, not "${activeProfile}".\n` +
					`To delete "${activeProfile}", run \`wrangler auth delete ${activeProfile}\`.`
			);
		}

		await logout("default");
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
		hideGlobalFlags: ["profile"],
	},
	behaviour: {
		printBanner: (args) => !args.json,
		printConfigWarnings: false,
		suggestSkillsAfterHandler: (args) => !args.json,
	},
	validateArgs(args) {
		if (args.profile) {
			throw new CommandLineArgsError(
				"--profile cannot be used with the whoami command as it only works on the currently active profile.",
				{
					telemetryMessage: "profile flag with whoami",
				}
			);
		}
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
		printActiveProfile: false,
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

export const authKeyringCommand = createCommand({
	metadata: {
		description:
			"🔐 Configure whether OAuth credentials are stored in the OS keychain",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Account",
		hideGlobalFlags: ["profile"],
	},
	behaviour: {
		printConfigWarnings: false,
		provideConfig: false,
		printActiveProfile: false,
	},
	positionalArgs: ["action"],
	args: {
		action: {
			describe:
				"Whether to enable or disable keyring storage. Omit to show the current setting.",
			type: "string",
			choices: ["enable", "disable"],
		},
	},
	validateArgs(args) {
		if (args.profile) {
			throw new CommandLineArgsError(
				"--profile cannot be used with `wrangler auth keyring`; it configures keyring storage globally for every profile.",
				{ telemetryMessage: "profile flag with auth keyring" }
			);
		}
	},
	async handler(args) {
		// No action: report the current setting (read-only — never mutates the
		// preference, so it is always safe to run).
		if (args.action === undefined) {
			const envOverride = getCloudflareAuthUseKeyringFromEnv();
			const persisted = readUserPreferences().keyring_enabled === true;
			const effective = envOverride ?? persisted;
			logger.log(
				`Keyring storage is ${effective ? "enabled" : "disabled"}` +
					(envOverride !== undefined
						? ` (overridden by CLOUDFLARE_AUTH_USE_KEYRING=${envOverride}; persisted preference: ${
								persisted ? "enabled" : "disabled"
							})`
						: "") +
					"."
			);
			logger.log(
				`Credentials are currently stored in: ${getCredentialStore().describe()}`
			);
			return;
		}

		const enable = args.action === "enable";
		const { enabled } = setKeyringPreference(enable);
		if (enable) {
			if (enabled) {
				logger.log(
					"Keyring storage enabled. New OAuth credentials will be encrypted with a key held in your OS keychain. Run `wrangler login` or `wrangler auth create <name>` to (re-)authenticate."
				);
			}
			// If `enabled` is false here the opt-in was rolled back;
			// `setKeyringPreference` already warned about why.
		} else {
			logger.log(
				"Keyring storage disabled. New OAuth credentials will be stored in the plaintext config file."
			);
		}
	},
});
