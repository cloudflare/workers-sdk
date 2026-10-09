// `./pages-assets` dynamically imports `@cloudflare/pages-shared`, whose source
// relies on Workers runtime globals and `global` augmentations that conflict
// with this package's Node.js typing environment. That file is therefore
// excluded from type checking, and this file provides its public declarations.
import type { Logger } from "@cloudflare/workers-utils";
import type { Request, Response } from "miniflare";

export interface Options {
	log: Logger;
	proxyPort?: number;
	directory?: string;
	signal?: AbortSignal;
}

/**
 * Create the `ASSETS` binding fetcher for a Pages project in local development.
 *
 * @param options The assets directory or proxy port, logger and abort signal
 * @returns A fetcher that serves Pages assets for a request
 */
export declare function generateASSETSBinding(
	options: Options
): Promise<(request: Request) => Promise<Response>>;
