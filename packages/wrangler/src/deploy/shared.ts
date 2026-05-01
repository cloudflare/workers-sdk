import { configFileName, UserError } from "@cloudflare/workers-utils";
import { logger } from "../logger";

/**
 * Shared arg validation for both `wrangler deploy` and `wrangler versions upload`.
 * Called from each command's `validateArgs` hook (before config is read).
 */
export function validateArgs(args: {
	nodeCompat: boolean | undefined;
	latest: boolean | undefined;
	config: string | undefined;
}): void {
	if (args.nodeCompat) {
		throw new UserError(
			"The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.",
			{ telemetryMessage: "deploy node compat unsupported" }
		);
	}

	if (args.latest) {
		logger.warn(
			`Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your ${configFileName(args.config)} file.`
		);
	}
}
