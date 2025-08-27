import * as path from "node:path";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
	Request as MiniflareRequest,
	Response as MiniflareResponse,
} from "miniflare";
import type * as http from "node:http";
import type * as vite from "vite";

export function getOutputDirectory(
	userConfig: vite.UserConfig,
	environmentName: string
) {
	const rootOutputDirectory = userConfig.build?.outDir ?? "dist";

	return (
		userConfig.environments?.[environmentName]?.build?.outDir ??
		path.join(rootOutputDirectory, environmentName)
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
		try {
			const request = createRequest(req, res);
			let response = await handler(toMiniflareRequest(request), req);

			// Vite uses HTTP/2 when `server.https` or `preview.https` is enabled
			if (req.httpVersionMajor === 2) {
				response = new MiniflareResponse(response.body, response);
				// HTTP/2 disallows use of the `transfer-encoding` header
				response.headers.delete("transfer-encoding");
			}

			await sendResponse(res, response as unknown as Response);
		} catch (error) {
			next(error);
		}
	};
}

function toMiniflareRequest(request: Request): MiniflareRequest {
	// We set the X-Forwarded-Host header to the original host as the `Host` header inside a Worker will contain the workerd host
	const host = request.headers.get("Host");
	if (host) {
		request.headers.set("X-Forwarded-Host", host);
	}
	// Undici sets the `Sec-Fetch-Mode` header to `cors` so we capture it in a custom header to be converted back later.
	const secFetchMode = request.headers.get("Sec-Fetch-Mode");
	if (secFetchMode) {
		request.headers.set("X-Mf-Sec-Fetch-Mode", secFetchMode);
	}
	return new MiniflareRequest(request.url, {
		method: request.method,
		headers: [["accept-encoding", "identity"], ...request.headers],
		body: request.body,
		duplex: "half",
	});
}
