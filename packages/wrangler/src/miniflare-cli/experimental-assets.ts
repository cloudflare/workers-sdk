import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Request, Response } from "miniflare";
import { hashFile } from "../pages/hash";
import type { Logger } from "../logger";
import type { Request as WorkersRequest } from "@cloudflare/workers-types/experimental";
import type { fetch, RequestInit } from "miniflare";

export interface Options {
	log: Logger;
	directory: string;
}

// TODO: tmp. This should be actually integrated as a miniflare feature rather than live in user space as a binding like this
export default async function generateExperimentalAssetsBinding(
	options: Options
) {
	const assetsFetch = await generateAssetsFetch(options.directory);

	return async function (miniflareRequest: Request) {
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
	};
}

async function generateAssetsFetch(directory: string): Promise<typeof fetch> {
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

	const { generateHandler } = await import(
		"@cloudflare/workers-shared/asset-server"
	);

	const generateResponse = async (request: Request) => {
		const assetKeyEntryMap = new Map<string, string>();

		return await generateHandler<string>({
			request: request as unknown as WorkersRequest,
			logError: console.error,
			findAssetEntryForPath: async (path) => {
				const filepath = resolve(join(directory, path));
				if (!filepath.startsWith(directory)) {
					return null;
				}

				if (existsSync(filepath) && lstatSync(filepath).isFile()) {
					const hash = hashFile(filepath);
					assetKeyEntryMap.set(hash, filepath);
					return hash;
				}

				return null;
			},
			getAssetKey: (assetEntry) => {
				return assetEntry;
			},
			fetchAsset: async (assetKey) => {
				const filepath = assetKeyEntryMap.get(assetKey);
				if (!filepath) {
					throw new Error(
						"Could not fetch asset. Please file an issue on GitHub (https://github.com/cloudflare/workers-sdk/issues/new/choose) with reproduction steps."
					);
				}
				const body = readFileSync(filepath) as unknown as ReadableStream;

				return { body };
			},
		});
	};

	return async (input, init) => {
		const request = new Request(input, init as RequestInit);
		return (await generateResponse(request)) as unknown as Response;
	};
}
