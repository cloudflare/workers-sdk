import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { listScopes, login, logout, validateScopeKeys } from "./user";
import { whoami } from "./whoami";

export const loginCommand = createCommand({
	metadata: {
		description: "🔓 Login to Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
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
		description: "🕵️  Retrieve your user information",
		owner: "Workers: Authoring and Testing",
		status: "stable",
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
