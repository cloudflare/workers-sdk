import type { FetchResultFetcher, Logger } from "@cloudflare/workers-utils";

const noop = () => {};

export let logger: Logger = {
	debug: noop,
	log: noop,
	info: noop,
	warn: noop,
	error: noop,
};

export let fetchResult: FetchResultFetcher = () => {
	throw new Error("initContainersSharedContext() must be called first");
};

export type ContainersSharedContext = {
	logger: Logger;
	fetchResult: FetchResultFetcher;
};

export function initContainersSharedContext(
	ctx: ContainersSharedContext
): void {
	logger = ctx.logger;
	fetchResult = ctx.fetchResult;
}
