import { fetchListResult, fetchResult } from "../cfetch";
import { confirm, prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import type { DeployHelpersContext } from "@cloudflare/deploy-helpers";
import type { ApiCredentials } from "@cloudflare/workers-utils";

/**
 * Builds a `DeployHelpersContext` from Wrangler's singletons (logger, auth'd
 * fetchers and interactive prompts) so that `@cloudflare/deploy-helpers`
 * functions can be called from code paths that don't have easy access to command
 * `HandlerContext`.
 *
 * An optional `apiToken` can be provided to override the credentials used by
 * `fetchResult` (e.g. for remote preview sessions that authenticate with a
 * per-request token rather than the global account credentials).
 */
export function createDeployHelpersContext(options?: {
	apiToken?: ApiCredentials;
}): DeployHelpersContext {
	return {
		fetchResult: (complianceConfig, resource, init, queryParams, abortSignal) =>
			fetchResult(
				complianceConfig,
				resource,
				init,
				queryParams,
				abortSignal,
				options?.apiToken
			),
		fetchListResult,
		logger,
		confirm,
		prompt,
		isNonInteractiveOrCI,
	};
}
