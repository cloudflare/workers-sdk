import * as path from "node:path";
import getPort, { portNumbers } from "get-port";
import { Request as MiniflareRequest } from "miniflare";
import * as vite from "vite";
import { ROUTER_WORKER_NAME } from "./constants";
import type { Miniflare } from "miniflare";
import type { IncomingHttpHeaders } from "node:http";

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

export function getRouterWorker(miniflare: Miniflare) {
	return miniflare.getWorker(ROUTER_WORKER_NAME);
}

export function toMiniflareRequest(request: Request): MiniflareRequest {
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

export function nodeHeadersToWebHeaders(
	nodeHeaders: IncomingHttpHeaders
): Headers {
	const headers = new Headers();

	for (const [key, value] of Object.entries(nodeHeaders)) {
		if (typeof value === "string") {
			headers.append(key, value);
		} else if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
		}
	}

	return headers;
}

const postfixRE = /[?#].*$/;
export function cleanUrl(url: string): string {
	return url.replace(postfixRE, "");
}

export type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>;

export type MaybePromise<T> = Promise<T> | T;

export type Defined<T> = Exclude<T, undefined>;

export function getFirstAvailablePort(start: number) {
	return getPort({ port: portNumbers(start, 65535) });
}
