import { readConfig } from "../config";
import { defineCommand } from "../core/define-command";
import { CommandLineArgsError } from "../errors";
import * as metrics from "../metrics";
import { listScopes, login, logout, validateScopeKeys } from "./user";
import { whoami } from "./whoami";

defineCommand({
	command: "wrangler login",
	metadata: {
		description: "🔓 Login to Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
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
	async handler(args) {
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
		const config = readConfig(args.config, args, undefined, true);
		await metrics.sendMetricsEvent("login user", {
			sendMetrics: config.send_metrics,
		});

		// TODO: would be nice if it optionally saved login
		// credentials inside node_modules/.cache or something
		// this way you could have multiple users on a single machine
	},
});

defineCommand({
	command: "wrangler logout",
	metadata: {
		description: "🚪 Logout from Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	async handler(args) {
		await logout();
		const config = readConfig(args.config, args, undefined, true);
		await metrics.sendMetricsEvent("logout user", {
			sendMetrics: config.send_metrics,
		});
	},
});

defineCommand({
	command: "wrangler whoami",
	metadata: {
		description: "🕵️  Retrieve your user information",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	args: {
		account: {
			type: "string",
			describe:
				"Show membership information for the given account (id or name).",
		},
	},
	async handler(args) {
		await whoami(args.account);
		const config = readConfig(args.config, args, undefined, true);
		await metrics.sendMetricsEvent("view accounts", {
			sendMetrics: config.send_metrics,
		});
	},
});
