import assert from "node:assert";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createMetadataObject } from "@cloudflare/pages-shared/metadata-generator/createMetadataObject";
import { parseHeaders, parseRedirects } from "@cloudflare/workers-shared";
import { watch } from "chokidar";
import { getType } from "mime";
import { fetch, Request, Response } from "miniflare";
import { Dispatcher, getGlobalDispatcher } from "undici";
import { logger } from "../logger";
import { hashFile } from "../pages/hash";
import type { Logger } from "../logger";
import type { Metadata } from "@cloudflare/pages-shared/asset-server/metadata";
import type {
	ParsedHeaders,
	ParsedRedirects,
} from "@cloudflare/workers-shared";
import type { Request as WorkersRequest } from "@cloudflare/workers-types/experimental";
import type { RequestInit } from "miniflare";
import type { IncomingHttpHeaders } from "undici/types/header";

export interface Options {
	log: Logger;
	proxyPort?: number;
	directory?: string;
}

export default async function generateASSETSBinding(options: Options) {
	const assetsFetch =
		options.directory !== undefined
			? await generateAssetsFetch(options.directory, options.log)
			: invalidAssetsFetch;

	return async function (miniflareRequest: Request) {
		if (options.proxyPort) {
			try {
				const url = new URL(miniflareRequest.url);
				url.host = `localhost:${options.proxyPort}`;
				const proxyRequest = new Request(url, miniflareRequest as RequestInit);
				if (proxyRequest.headers.get("Upgrade") === "websocket") {
					proxyRequest.headers.delete("Sec-WebSocket-Accept");
					proxyRequest.headers.delete("Sec-WebSocket-Key");
				}
				return await fetch(proxyRequest, {
					dispatcher: new ProxyDispatcher(miniflareRequest.headers.get("Host")),
				});
			} catch (thrown) {
				options.log.error(new Error(`Could not proxy request: ${thrown}`));

				// TODO: Pretty error page
				return new Response(`[wrangler] Could not proxy request: ${thrown}`, {
					status: 502,
				});
			}
		} else {
			try {
				return await assetsFetch(miniflareRequest);
			} catch (thrown) {
				options.log.error(new Error(`Could not serve static asset: ${thrown}`));

				// TODO: Pretty error page
				return new Response(
					`[wrangler] Could not serve static asset: ${thrown}`,
					{ status: 502 }
				);
			}
		}
	};
}

/**
 * An Undici custom Dispatcher that is used for the fetch requests
 * of the Pages dev server proxy.
 *
 * Notably, the ProxyDispatcher reinstates the Host header that was removed by the
 * Undici `fetch` function call. Undici removes the Host header as a security precaution,
 * but this is not relevant for an internal Proxy.
 *
 * The ProxyDispatcher will delegate through to the current global `Dispatcher`,
 * ensuring that the request is routed correctly in case a developer has changed the
 * global Dispatcher by a call to `setGlobalDispatcher()`.
 */
class ProxyDispatcher extends Dispatcher {
	private dispatcher: Dispatcher = getGlobalDispatcher();

	constructor(private host: string | null) {
		super();
	}

	dispatch(
		options: Dispatcher.DispatchOptions,
		handler: Dispatcher.DispatchHandlers
	): boolean {
		if (this.host !== null) {
			ProxyDispatcher.reinstateHostHeader(options.headers, this.host);
		}
		return this.dispatcher.dispatch(options, handler);
	}

	close() {
		return this.dispatcher.close();
	}

	destroy() {
		return this.dispatcher.destroy();
	}

	/**
	 * Ensure that the request contains a Host header, which would have been deleted
	 * by the `fetch()` function before calling `dispatcher.dispatch()`.
	 */
	private static reinstateHostHeader(
		headers: string[] | IncomingHttpHeaders | null | undefined,
		host: string
	) {
		assert(headers, "Expected all proxy requests to contain headers.");
		assert(
			!Array.isArray(headers),
			"Expected proxy request headers to be a hash object"
		);
		assert(
			Object.keys(headers).every((h) => h.toLowerCase() !== "host"),
			"Expected Host header to have been deleted."
		);
		headers["Host"] = host;
	}
}

async function generateAssetsFetch(
	directory: string,
	log: Logger
): Promise<typeof fetch> {
	directory = resolve(directory);
	// Defer importing miniflare until we really need it

	// NOTE: These dynamic imports bring in `global` type augmentations from
	// `@cloudflare/pages-shared/environment-polyfills/types.ts`, allowing us to
	// use `fetch`, `Headers`, `Request` and `Response` as globals in this file
	// and the *entire* `miniflare-cli` TypeScript project.
	const polyfill = (
		await import("@cloudflare/pages-shared/environment-polyfills/miniflare")
	).default;
	await polyfill();

	const { generateHandler, parseQualityWeightedList } = await import(
		"@cloudflare/pages-shared/asset-server/handler"
	);

	const headersFile = join(directory, "_headers");
	const redirectsFile = join(directory, "_redirects");
	const workerFile = join(directory, "_worker.js");

	const ignoredFiles = [headersFile, redirectsFile, workerFile];

	let redirects: ParsedRedirects | undefined;
	if (existsSync(redirectsFile)) {
		const contents = readFileSync(redirectsFile, "utf-8");
		redirects = parseRedirects(contents, {
			htmlHandling: undefined, // Pages dev server doesn't expose html_handling configuration in this context.
		});
	}

	let headers: ParsedHeaders | undefined;
	if (existsSync(headersFile)) {
		const contents = readFileSync(headersFile, "utf-8");
		headers = parseHeaders(contents);
	}

	let metadata = createMetadataObject({
		redirects,
		headers,
		headersFile,
		redirectsFile,
		logger: log,
	});

	watch([headersFile, redirectsFile], { persistent: true }).on(
		"change",
		(path) => {
			switch (path) {
				case headersFile: {
					log.log("_headers modified. Re-evaluating...");
					const contents = readFileSync(headersFile).toString();
					headers = parseHeaders(contents);
					break;
				}
				case redirectsFile: {
					log.log("_redirects modified. Re-evaluating...");
					const contents = readFileSync(redirectsFile).toString();
					redirects = parseRedirects(contents, {
						htmlHandling: undefined, // Pages dev server doesn't expose html_handling configuration in this context.
					});
					break;
				}
			}

			metadata = createMetadataObject({
				redirects,
				headers,
				redirectsFile,
				headersFile,
				logger: log,
			});
		}
	);

	const generateResponse = async (request: Request) => {
		const assetKeyEntryMap = new Map<string, string>();

		return await generateHandler<string>({
			request: request as unknown as WorkersRequest,
			metadata: metadata as Metadata,
			xServerEnvHeader: "dev",
			xWebAnalyticsHeader: false,
			logError: logger.error,
			findAssetEntryForPath: async (path) => {
				const filepath = resolve(join(directory, path));
				if (!filepath.startsWith(directory)) {
					return null;
				}

				if (
					existsSync(filepath) &&
					lstatSync(filepath).isFile() &&
					!ignoredFiles.includes(filepath)
				) {
					const hash = hashFile(filepath);
					assetKeyEntryMap.set(hash, filepath);
					return hash;
				}

				return null;
			},
			getAssetKey: (assetEntry) => {
				return assetEntry;
			},
			negotiateContent: (contentRequest) => {
				let rawAcceptEncoding: string | undefined;
				if (
					contentRequest.cf &&
					"clientAcceptEncoding" in contentRequest.cf &&
					contentRequest.cf.clientAcceptEncoding
				) {
					rawAcceptEncoding = contentRequest.cf.clientAcceptEncoding as string;
				} else {
					rawAcceptEncoding =
						contentRequest.headers.get("Accept-Encoding") || undefined;
				}

				const acceptEncoding = parseQualityWeightedList(rawAcceptEncoding);

				if (
					acceptEncoding["identity"] === 0 ||
					(acceptEncoding["*"] === 0 &&
						acceptEncoding["identity"] === undefined)
				) {
					throw new Error("No acceptable encodings available");
				}

				return { encoding: null };
			},
			fetchAsset: async (assetKey) => {
				const filepath = assetKeyEntryMap.get(assetKey);
				if (!filepath) {
					throw new Error(
						"Could not fetch asset. Please file an issue on GitHub (https://github.com/cloudflare/workers-sdk/issues/new/choose) with reproduction steps."
					);
				}
				const body = readFileSync(filepath) as unknown as ReadableStream;

				let contentType = getType(filepath) || "application/octet-stream";
				if (
					contentType.startsWith("text/") &&
					!contentType.includes("charset")
				) {
					contentType = `${contentType}; charset=utf-8`;
				}

				return { body, contentType };
			},
		});
	};

	return async (input, init) => {
		const request = new Request(input, init as RequestInit);
		return (await generateResponse(request)) as unknown as Response;
	};
}

const invalidAssetsFetch: typeof fetch = () => {
	throw new Error(
		"Trying to fetch assets directly when there is no `directory` option specified."
	);
};
