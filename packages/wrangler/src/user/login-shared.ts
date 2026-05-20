import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { listScopes, validateScopeKeys } from "./user";

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
