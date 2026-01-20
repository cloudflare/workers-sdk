import * as nodePath from "node:path";
import * as util from "node:util";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
	CoreHeaders,
	Request as MiniflareRequest,
	Response as MiniflareResponse,
} from "miniflare";
import semverGte from "semver/functions/gte";
import { version as viteVersion } from "vite";
import * as vite from "vite";
import type { PluginContext } from "./context";
import type * as http from "node:http";

export const debuglog = util.debuglog("@cloudflare:vite-plugin");

/**
 * Creates an internal plugin to be used inside the main `vite-plugin-cloudflare` plugin.
 * The provided `name` will be prefixed with `vite-plugin-cloudflare:`.
 */
export function createPlugin(
	name: string,
	pluginFactory: (ctx: PluginContext) => Omit<vite.Plugin, "name">
): (ctx: PluginContext) => vite.Plugin {
	return (ctx) => {
		return {
			name: `vite-plugin-cloudflare:${name}`,
			sharedDuringBuild: true,
			...pluginFactory(ctx),
		};
	};
}

export function getOutputDirectory(
	userConfig: vite.UserConfig,
	environmentName: string
) {
	const rootOutputDirectory = userConfig.build?.outDir ?? "dist";

	return (
		userConfig.environments?.[environmentName]?.build?.outDir ??
		nodePath.join(rootOutputDirectory, environmentName)
	);
}

const postfixRE = /[?#].*$/;
export function cleanUrl(url: string): string {
	return url.replace(postfixRE, "");
}

export type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>;

export type MaybePromise<T> = Promise<T> | T;

export type Defined<T> = Exclude<T, undefined>;

export function withTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : `${path}/`;
}

export function createRequestHandler(
	handler: (
		request: MiniflareRequest,
		req: vite.Connect.IncomingMessage
	) => Promise<MiniflareResponse>
): (
	req: vite.Connect.IncomingMessage,
	res: http.ServerResponse,
	next: vite.Connect.NextFunction
) => Promise<void> {
	return async (req, res, next) => {
		let request: Request | undefined;

		try {
			// Built in vite middleware trims out the base path when passing in the request
			// We can restore it by using the `originalUrl` property
			// This makes sure the worker receives the correct url in both dev using vite and production
			if (req.originalUrl) {
				req.url = req.originalUrl;
			}
			request = createRequest(req, res);

			let response = await handler(toMiniflareRequest(request), req);

			// Vite uses HTTP/2 when `server.https` or `preview.https` is enabled
			if (req.httpVersionMajor === 2) {
				response = new MiniflareResponse(response.body, response);
				// HTTP/2 disallows use of the `transfer-encoding` header
				response.headers.delete("transfer-encoding");
			}

			await sendResponse(res, response as unknown as Response);
		} catch (error) {
			if (request?.signal.aborted) {
				// If the request was aborted, ignore the error
				return;
			}

			next(error);
		}
	};
}

export function satisfiesViteVersion(minVersion: string): boolean {
	return semverGte(viteVersion, minVersion);
}

function toMiniflareRequest(request: Request): MiniflareRequest {
	const host = request.headers.get("Host");
	const xForwardedHost = request.headers.get("X-Forwarded-Host");

	if (host && !xForwardedHost) {
		// Set the `x-forwarded-host` header to the host of the Vite server if it is not already set
		// Note that the `host` header inside the Worker will contain the workerd host
		// TODO: reconsider this when adopting `miniflare.dispatchFetch` as it may be possible to provide the Vite server host in the `host` header
		request.headers.set("X-Forwarded-Host", host);
	}

	// Undici sets the `Sec-Fetch-Mode` header to `cors` so we capture it in a custom header to be converted back later.
	const secFetchMode = request.headers.get("Sec-Fetch-Mode");
	if (secFetchMode) {
		request.headers.set(CoreHeaders.SEC_FETCH_MODE, secFetchMode);
	}
	return new MiniflareRequest(request.url, {
		method: request.method,
		headers: [["accept-encoding", "identity"], ...request.headers],
		body: request.body,
		duplex: "half",
		signal: request.signal,
	});
}

export const isRolldown = "rolldownVersion" in vite;
