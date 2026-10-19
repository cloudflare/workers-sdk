import assert from "node:assert";
import { generateStaticRoutingRuleMatcher } from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
import { CoreHeaders } from "miniflare";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	ROUTER_WORKER_NAME,
} from "./constants";
import type { ResolvedWorkerConfig } from "./plugin-config";
import type { IncomingMessage, NextFunction } from "./request-handler";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type {
	Miniflare,
	Request as MiniflareRequest,
	Response as MiniflareResponse,
} from "miniflare";
import type { ServerResponse } from "node:http";

const UNKNOWN_HOST = "http://localhost";

type Middleware = (
	req: IncomingMessage,
	res: ServerResponse,
	next: NextFunction
) => void;

/**
 * Dispatches a dev server request to the router Worker, or to the asset Worker
 * when the request came from the entry Worker's assets binding.
 *
 * @param miniflare The Miniflare instance
 * @param request The request to dispatch
 * @param req The incoming request, which records whether it is an asset request
 * @returns The Worker's response
 */
export function dispatchDevRequest(
	miniflare: Miniflare,
	request: MiniflareRequest,
	req: IncomingMessage
): Promise<MiniflareResponse> {
	request.headers.set(
		CoreHeaders.ROUTE_OVERRIDE,
		req[kRequestType] === "asset" ? ASSET_WORKER_NAME : ROUTER_WORKER_NAME
	);

	return miniflare.dispatchFetch(request, { redirect: "manual" });
}

/**
 * Resolves the entry Worker's `run_worker_first` rules.
 *
 * @param entryWorkerConfig The entry Worker
 * @param staticRouting The parsed `run_worker_first` rules, when it is an array
 * @returns The rules, or `undefined` when assets are served first
 */
export function resolveStaticRouting(
	entryWorkerConfig: ResolvedWorkerConfig,
	staticRouting: StaticRouting | undefined
): StaticRouting | undefined {
	return entryWorkerConfig.assets?.runWorkerFirst === true
		? { user_worker: ["/*"] }
		: staticRouting;
}

/**
 * Creates a middleware that applies `run_worker_first` rules before the dev
 * server's own middleware: excluded paths are marked as asset requests, and
 * included paths are sent straight to the entry Worker.
 *
 * @param staticRouting The `run_worker_first` rules
 * @param userWorkerHandler Sends a request to the entry Worker
 * @returns The middleware
 */
export function createStaticRoutingMiddleware(
	staticRouting: StaticRouting,
	userWorkerHandler: Middleware
): Middleware {
	const excludeRulesMatcher = generateStaticRoutingRuleMatcher(
		staticRouting.asset_worker ?? []
	);
	const includeRulesMatcher = generateStaticRoutingRuleMatcher(
		staticRouting.user_worker
	);

	return function cloudflarePreMiddleware(req, res, next) {
		assert(req.url, `req.url not defined`);
		// Only the URL pathname is used to match rules
		const request = new Request(new URL(req.url, UNKNOWN_HOST));

		if (req[kRequestType] === "asset") {
			next();
		} else if (excludeRulesMatcher({ request })) {
			req[kRequestType] = "asset";
			next();
		} else if (includeRulesMatcher({ request })) {
			userWorkerHandler(req, res, next);
		} else {
			next();
		}
	};
}
