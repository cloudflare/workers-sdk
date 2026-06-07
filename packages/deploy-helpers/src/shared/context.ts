import type { DeployHelpersContext } from "./types";
import type {
	FetchKVGetValueFetcher,
	FetchListResultFetcher,
	FetchPagedListResultFetcher,
	FetchResultFetcher,
	Logger,
} from "@cloudflare/workers-utils";

export let logger: Logger;
export let fetchResult: FetchResultFetcher;
export let fetchListResult: FetchListResultFetcher;
export let fetchPagedListResult: FetchPagedListResultFetcher;
export let fetchKVGetValue: FetchKVGetValueFetcher;
export let confirm: DeployHelpersContext["confirm"];
export let prompt: DeployHelpersContext["prompt"];
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
	isNonInteractiveOrCI = ctx.isNonInteractiveOrCI;
}
