import type { DeployHelpersContext } from "./types";
import type {
	FetchKVGetValueFetcher,
	FetchListResultFetcher,
	FetchPagedListResultFetcher,
	FetchResultFetcher,
	Logger,
} from "@cloudflare/workers-utils";

/**
 * Module-level context globals for deploy-helpers.
 *
 * These are typed as non-nullable but are undefined until initDeployHelpersContext()
 * is called. Consumers must import the live binding directly (e.g. `import { logger }`)
 * and NOT destructure or cache the value at module-load time, otherwise they will
 * capture `undefined` before init runs.
 *
 * Example:
 *   import { logger } from "./context";  // correct: live binding
 *   const { logger } = await import("./context");  // WRONG: captures undefined
 */
export let logger: Logger;
export let fetchResult: FetchResultFetcher;
export let fetchListResult: FetchListResultFetcher;
export let fetchPagedListResult: FetchPagedListResultFetcher;
export let fetchKVGetValue: FetchKVGetValueFetcher;
export let confirm: DeployHelpersContext["confirm"];
export let prompt: DeployHelpersContext["prompt"];
export let select: DeployHelpersContext["select"];
export let isNonInteractiveOrCI: () => boolean;

/**
 * Set the global context for deploy-helpers. Must be called once at
 * startup before any deploy-helpers function that needs these values.
 */
export function initDeployHelpersContext(ctx: DeployHelpersContext): void {
	logger = ctx.logger;
	fetchResult = ctx.fetchResult;
	fetchListResult = ctx.fetchListResult;
	fetchPagedListResult = ctx.fetchPagedListResult;
	fetchKVGetValue = ctx.fetchKVGetValue;
	confirm = ctx.confirm;
	prompt = ctx.prompt;
	select = ctx.select;
	isNonInteractiveOrCI = ctx.isNonInteractiveOrCI;
}
