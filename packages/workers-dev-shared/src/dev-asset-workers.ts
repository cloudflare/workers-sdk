import * as fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Response as MiniflareResponse } from "miniflare";
import { ASSET_WORKER_NAME, ROUTER_WORKER_NAME } from "./constants";
import type { ResolvedWorkerConfig } from "./plugin-config";
import type { AssetConfig } from "@cloudflare/workers-shared/utils/types";
import type { WorkerOptions } from "miniflare";
import type { OutgoingHttpHeaders } from "node:http";

export const INTERNAL_WORKERS_COMPATIBILITY_DATE = "2024-10-04";

// We want module names to be their absolute path without the leading slash
// (i.e. the modules root should be the root directory). On Windows, we need
// paths to include the drive letter (i.e. `C:/a/b/c/index.mjs`).
// Internally, Miniflare uses `path.relative(modulesRoot, path)` to compute
// module names. Setting `modulesRoot` to a drive letter and prepending this
// to paths ensures correct names. This requires us to specify `contents` in
// the miniflare module definitions though, as the new paths don't exist.
export const miniflareModulesRoot = process.platform === "win32" ? "Z:\\" : "/";

type MiniflareEnv = NonNullable<WorkerOptions["config"]["env"]>;

/**
 * Reads a bundled internal Worker into a Miniflare manifest.
 *
 * @param workerPath The Worker's path relative to `baseUrl`
 * @param baseUrl The URL that the consumer's bundled internal Workers are relative to
 * @returns The Worker's manifest
 */
export async function getInternalWorkerManifest(
	workerPath: string,
	baseUrl: string | URL
): Promise<NonNullable<WorkerOptions["config"]["manifest"]>> {
	return {
		mainModule: workerPath,
		modulesRoot: miniflareModulesRoot,
		modules: {
			[workerPath]: {
				type: "esm",
				contents: await fsp.readFile(
					fileURLToPath(new URL(workerPath, baseUrl)),
					"utf8"
				),
			},
		},
	};
}

/** How the asset Worker reads HTML from the dev server. */
export interface DevHtmlHandlers {
	/**
	 * Resolves the pathname of a `.html` request to the pathname that
	 * `fetchHtml` accepts, or `null` when there is no such HTML file.
	 */
	htmlExists(pathname: string): Promise<string | null>;
	/** Returns the HTML for a pathname returned by `htmlExists`. */
	fetchHtml(pathname: string): Promise<string | Buffer>;
}

/**
 * Builds the Miniflare options for the router and asset Workers, which serve
 * assets in dev as they are served when deployed, reading HTML from the dev
 * server. Consumers bundle `router-worker` and `asset-worker` from
 * `src/workers` to `./workers/<name>/index.js` relative to `baseUrl`.
 *
 * @param options.baseUrl The URL that the consumer's bundled internal Workers are relative to
 * @param options.entryWorkerConfig The entry Worker, if there is one
 * @param options.hasUserWorker Whether the entry Worker runs code rather than only serving assets
 * @param options.assetsConfig The assets config, from `getAssetsConfig()`
 * @param options.headers The headers that the dev server adds to responses
 * @param options.html Reads HTML from the dev server
 * @returns The router and asset Workers' options
 */
export async function getDevAssetWorkerOptions(options: {
	baseUrl: string | URL;
	entryWorkerConfig: Pick<ResolvedWorkerConfig, "name" | "access"> | undefined;
	hasUserWorker: boolean;
	assetsConfig: AssetConfig;
	headers: OutgoingHttpHeaders | undefined;
	html: DevHtmlHandlers;
}): Promise<WorkerOptions[]> {
	const { entryWorkerConfig, html } = options;
	const [routerWorkerManifest, assetWorkerManifest] = await Promise.all([
		getInternalWorkerManifest(
			"./workers/router-worker/index.js",
			options.baseUrl
		),
		getInternalWorkerManifest(
			"./workers/asset-worker/index.js",
			options.baseUrl
		),
	]);

	return [
		{
			config: {
				name: ROUTER_WORKER_NAME,
				// TODO: Move this handling into Miniflare so Access is applied to the
				// user Worker invocation without propagating through Worker boundaries.
				access: entryWorkerConfig?.access,
				compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
				compatibilityFlags: ["enable_ctx_exports"],
				manifest: routerWorkerManifest,
				env: {
					CONFIG: {
						type: "json",
						value: {
							has_user_worker: options.hasUserWorker,
						},
					},
					ASSET_WORKER: {
						type: "worker",
						worker: ASSET_WORKER_NAME,
					},
					...(entryWorkerConfig
						? {
								USER_WORKER: {
									type: "worker",
									worker: entryWorkerConfig.name,
								} satisfies MiniflareEnv[string],
							}
						: {}),
				},
			},
			dev: {
				unsafeRegisterWorker: false,
			},
		},
		{
			config: {
				name: ASSET_WORKER_NAME,
				compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
				manifest: assetWorkerManifest,
				env: {
					CONFIG: { type: "json", value: options.assetsConfig },
					__VITE_HEADERS__: {
						type: "text",
						value: JSON.stringify(options.headers ?? {}),
					},
					__VITE_HTML_EXISTS__: {
						type: "fetcher",
						handler: async (request) => {
							const { pathname } = new URL(request.url);

							return MiniflareResponse.json(
								pathname.endsWith(".html")
									? await html.htmlExists(pathname)
									: null
							);
						},
					},
					__VITE_FETCH_HTML__: {
						type: "fetcher",
						handler: async (request) => {
							const { pathname } = new URL(request.url);

							try {
								return new MiniflareResponse(await html.fetchHtml(pathname), {
									headers: { "Content-Type": "text/html" },
								});
							} catch (error) {
								throw new Error(
									`Unexpected error. Failed to load "${pathname}".`,
									{
										cause: error,
									}
								);
							}
						},
					},
				},
			},
			dev: {
				unsafeRegisterWorker: false,
			},
		},
	];
}
