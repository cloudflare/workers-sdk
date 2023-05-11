import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createMetadataObject } from "@cloudflare/pages-shared/metadata-generator/createMetadataObject";
import { parseHeaders } from "@cloudflare/pages-shared/metadata-generator/parseHeaders";
import { parseRedirects } from "@cloudflare/pages-shared/metadata-generator/parseRedirects";
import { watch } from "chokidar";
import { getType } from "mime";
import { hashFile } from "../pages/hash";
import type { Metadata } from "@cloudflare/pages-shared/asset-server/metadata";
import type {
	ParsedRedirects,
	ParsedHeaders,
} from "@cloudflare/pages-shared/metadata-generator/types";
import type {
	Request as MiniflareRequest,
	RequestInfo as MiniflareRequestInfo,
	RequestInit as MiniflareRequestInit,
} from "@miniflare/core";

interface Logger {
	log: (message: string) => void;
	warn: (message: string) => void;
	error: (error: Error) => void;
}

export interface Options {
	log: Logger;
	proxyPort?: number;
	directory?: string;
	tre: boolean;
}

export default async function generateASSETSBinding(options: Options) {
	const assetsFetch =
		options.directory !== undefined
			? await generateAssetsFetch(options.directory, options.log, options.tre)
			: invalidAssetsFetch;

	const miniflare = options.tre
		? await import("@miniflare/tre")
		: await import("@miniflare/core");

	const Request = miniflare.Request as typeof MiniflareRequest;
	const Response = miniflare.Response;
	// WebSockets won't work with `--experimental-local` until we expose something like `upgradingFetch` from `@miniflare/tre`.
	const fetch = (
		options.tre
			? miniflare.fetch
			: (await import("@miniflare/web-sockets")).upgradingFetch
	) as (request: Request) => Promise<Response>;

	return async function (miniflareRequest: Request) {
		if (options.proxyPort) {
			try {
				const url = new URL(miniflareRequest.url);
				url.host = `localhost:${options.proxyPort}`;
				const proxyRequest = new Request(url, miniflareRequest);
				if (proxyRequest.headers.get("Upgrade") === "websocket") {
					proxyRequest.headers.delete("Sec-WebSocket-Accept");
					proxyRequest.headers.delete("Sec-WebSocket-Key");
				}
				return await fetch(proxyRequest as Request);
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

async function generateAssetsFetch(
	directory: string,
	log: Logger,
	tre: boolean
): Promise<typeof fetch> {
	// Defer importing miniflare until we really need it

	// NOTE: These dynamic imports bring in `global` type augmentations from
	// `@cloudflare/pages-shared/environment-polyfills/types.ts`, allowing us to
	// use `fetch`, `Headers`, `Request` and `Response` as globals in this file
	// and the *entire* `miniflare-cli` TypeScript project.
	const polyfill = tre
		? (
				await import(
					"@cloudflare/pages-shared/environment-polyfills/miniflare-tre"
				)
		  ).default
		: (await import("@cloudflare/pages-shared/environment-polyfills/miniflare"))
				.default;

	await polyfill();

	const miniflare = tre
		? await import("@miniflare/tre")
		: await import("@miniflare/core");
	const Request = miniflare.Request as typeof MiniflareRequest;

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
		redirects = parseRedirects(contents);
	}

	let headers: ParsedHeaders | undefined;
	if (existsSync(headersFile)) {
		const contents = readFileSync(headersFile, "utf-8");
		headers = parseHeaders(contents);
	}

	let metadata = createMetadataObject({
		redirects,
		headers,
		logger: log.warn.bind(log),
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
					redirects = parseRedirects(contents);
					break;
				}
			}

			metadata = createMetadataObject({
				redirects,
				headers,
				logger: log.warn,
			});
		}
	);

	const generateResponse = async (request: Request) => {
		const assetKeyEntryMap = new Map<string, string>();

		return await generateHandler<string>({
			request,
			metadata: metadata as Metadata,
			xServerEnvHeader: "dev",
			logError: console.error,
			findAssetEntryForPath: async (path) => {
				const filepath = join(directory, path);

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

	return async (input: MiniflareRequestInfo, init?: MiniflareRequestInit) => {
		const request = new Request(input, init);
		return await generateResponse(request as unknown as Request);
	};
}

const invalidAssetsFetch: typeof fetch = () => {
	throw new Error(
		"Trying to fetch assets directly when there is no `directory` option specified."
	);
};
