import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { handleScopesArgs, loginArgs } from "./login-shared";
import {
	deleteProfile,
	getActiveProfileName,
	getProfileForDirectory,
	profileExists,
	readDirectoryBindings,
	removeDirectoryBinding,
	validateProfileName,
	writeDirectoryBindings,
} from "./profiles";
import {
	getAuthFromEnv,
	getOAuthTokenFromLocalState,
	login,
	logout,
	readAuthConfigFile,
	revokeToken,
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
		profile: {
			describe: "Use a named authentication profile",
			type: "string",
		},
		dir: {
			describe:
				"Directory to bind to the profile (defaults to current working directory)",
			type: "string",
		},
	},
	async handler(args, { config }) {
		if (handleScopesArgs(args)) {
			return;
		}

		// Profile-based login
		if (args.profile) {
			validateProfileName(args.profile);
			const dir = path.resolve(args.dir ?? process.cwd());

			if (profileExists(args.profile)) {
				// Profile exists: just bind the directory to it
				const bindings = readDirectoryBindings();
				bindings[dir] = args.profile;
				writeDirectoryBindings(bindings);
				logger.log(
					`✨ Bound directory "${dir}" to profile "${args.profile}".\n`
				);
			} else {
				// Profile doesn't exist: prompt to create it
				const shouldCreate = await confirm(
					`Profile "${args.profile}" does not exist. Would you like to create it?`,
					{ fallbackValue: false }
				);
				if (!shouldCreate) {
					logger.log(
						`You can create the profile manually with \`wrangler profiles create ${args.profile}\`.`
					);
					return;
				}

				logger.log(`Creating profile "${args.profile}"...\n`);

				await login(config, {
					scopes: args.scopes as Scope[] | undefined,
					browser: args.browser,
					callbackHost: args.callbackHost,
					callbackPort: args.callbackPort,
					profile: args.profile,
				});

				// Bind directory after successful login
				const bindings = readDirectoryBindings();
				bindings[dir] = args.profile;
				writeDirectoryBindings(bindings);
				logger.log(
					`✨ Created profile "${args.profile}" and bound it to directory "${dir}".\n`
				);
			}
		} else {
			// Default login (no profile)
			const currentProfile = getActiveProfileName();
			if (currentProfile) {
				const message = getProfileForDirectory()
					? `This directory is bound to the auth profile "${currentProfile}"\n`
					: `You are currently using the auth profile "${currentProfile}" (via WRANGLER_PROFILE).\nUnset the env var before attempting to switch profiles.\n`;
				logger.error(
					message,
					"If you want to create a new auth profile, run `wrangler profiles create <profile name>`.\n",
					"If you want to switch to an existing auth profile, run `wrangler login --profile=<profile name>`.\n"
				);
				return;
			}

			await login(config, {
				scopes: args.scopes as Scope[] | undefined,
				browser: args.browser,
				callbackHost: args.callbackHost,
				callbackPort: args.callbackPort,
			});
		}

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
	args: {
		profile: {
			describe: "Unbind a named authentication profile from a directory",
			type: "string",
		},
		dir: {
			describe:
				"Directory to unbind from the profile (defaults to current working directory)",
			type: "string",
		},
	},
	async handler(args) {
		// Profile-based logout (unbind directory)
		if (args.profile) {
			validateProfileName(args.profile);
			const dir = path.resolve(args.dir ?? process.cwd());

			// Check if this directory is actually bound to this profile
			const activeProfile = getProfileForDirectory();
			const bindings = readDirectoryBindings();
			if (activeProfile === undefined) {
				throw new UserError(`Directory "${dir}" is not bound to any profile.`, {
					telemetryMessage: "logout no binding",
				});
			} else if (!Object.keys(bindings).includes(dir)) {
				// There is a profile, but its not coming from the specified directory
				throw new UserError(
					`Directory "${dir}" is not bound to any profile, but a parent directory is bound to profile "${activeProfile}".\n Run "wrangler profiles list" to see all profiles and their bound directories.`,
					{
						telemetryMessage: "logout no binding on directory",
					}
				);
			} else if (activeProfile !== args.profile) {
				// There is a binding for this directory, but its for a different profile
				throw new UserError(
					`Directory "${dir}" is bound to profile "${activeProfile}", not "${args.profile}".`,
					{
						telemetryMessage: "logout profile mismatch",
					}
				);
			}

			// Remove the directory binding
			removeDirectoryBinding(dir);
			logger.log(
				`✅ Unbound directory "${dir}" from profile "${args.profile}".\n`
			);

			// Check if any other directories still use this profile
			const remainingBindings = readDirectoryBindings();
			const stillUsed = Object.values(remainingBindings).includes(args.profile);

			if (!stillUsed) {
				const shouldDelete = await confirm(
					`No other directories use profile "${args.profile}". Would you like to delete it?`,
					{ fallbackValue: false }
				);
				if (shouldDelete) {
					const token = readAuthConfigFile(args.profile).refresh_token;
					if (token) {
						await revokeToken(token);
					} else {
						logger.warn(
							`No refresh token found for profile "${args.profile}". The token could not be revoked and may still be valid.`
						);
					}
					deleteProfile(args.profile);
					logger.log(`✅ Deleted profile "${args.profile}".\n`);
				}
			}
		} else {
			// Default logout (no profile)
			await logout();
		}

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
		// handle this separately so we include the profile when calling the whoami() function
		printActiveProfile: false,
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
