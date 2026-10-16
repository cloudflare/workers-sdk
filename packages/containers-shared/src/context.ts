import { resolveCliPresentation } from "@cloudflare/workers-utils";
import type {
	CliPresentation,
	CliPresentationOverrides,
	FetchPagedListResultFetcher,
	FetchResultFetcher,
	Logger,
} from "@cloudflare/workers-utils";

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

export let fetchPagedListResult: FetchPagedListResultFetcher = () => {
	throw new Error("initContainersSharedContext() must be called first");
};

export let cliPresentation: CliPresentation = resolveCliPresentation();

export type ContainersSharedContext = {
	/** Consumer-specific names and commands used in user-facing output. */
	cliPresentation?: CliPresentationOverrides;
	logger: Logger;
	fetchResult: FetchResultFetcher;
	fetchPagedListResult?: FetchPagedListResultFetcher;
};

export function initContainersSharedContext(
	ctx: ContainersSharedContext
): void {
	cliPresentation = resolveCliPresentation(ctx.cliPresentation);
	logger = ctx.logger;
	fetchResult = ctx.fetchResult;
	if (ctx.fetchPagedListResult !== undefined) {
		fetchPagedListResult = ctx.fetchPagedListResult;
	}
}
