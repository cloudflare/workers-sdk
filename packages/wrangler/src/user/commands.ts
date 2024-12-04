import { createCommand } from "../core/create-command";
import { CommandLineArgsError } from "../errors";
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
			await login({ scopes: args.scopes, browser: args.browser });
			return;
		}
		await login({ browser: args.browser });
		await metrics.sendMetricsEvent("login user", {
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
		await metrics.sendMetricsEvent("logout user", {
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
		await whoami(args.account);
		await metrics.sendMetricsEvent("view accounts", {
			sendMetrics: config.send_metrics,
		});
	},
});
