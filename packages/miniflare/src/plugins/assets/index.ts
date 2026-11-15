import fs from "node:fs/promises";
import path, { join } from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import {
	CF_ASSETS_IGNORE_FILENAME,
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import {
	createAssetsIgnoreFunction,
	InvalidAssetsIgnoreError,
	maybeGetFile,
} from "@cloudflare/workers-shared/utils/helpers";
import { MiniflareCoreError } from "../../shared";
import { FALLBACK_COMPATIBILITY_DATE, getUserServiceName } from "../core";
import { getEnvBindingsOfType, ProxyNodeBinding } from "../shared";
import { ASSETS_PLUGIN_NAME, ROUTER_SERVICE_NAME } from "./constants";
import type { Service } from "../../runtime";
import type { Plugin } from "../shared";

function resolveAssetDirectory(
	rootPath: string | undefined,
	directory: string
) {
	if (rootPath !== undefined && !path.isAbsolute(directory)) {
		return path.resolve(rootPath, directory);
	}
	return directory;
}

export const ASSETS_PLUGIN: Plugin = {
	bindingTypeDescription: "Assets",
	async getBindings(options) {
		const [assetsBinding] = getEnvBindingsOfType(options.config, "assets");
		if (!assetsBinding) {
			return [];
		}
		const [bindingName] = assetsBinding;
		return [
			{
				// binding between User Worker and Asset Worker
				name: bindingName,
				service: {
					name: `${ROUTER_SERVICE_NAME}:${options.config.name}`,
					entrypoint: "AssetWorker",
				},
			},
		];
	},

	async getNodeBindings(options) {
		const [assetsBinding] = getEnvBindingsOfType(options.config, "assets");
		if (!assetsBinding) {
			return {};
		}
		return {
			[assetsBinding[0]]: new ProxyNodeBinding(),
		};
	},

	async getServices({ options, tmpPath }) {
		const assets = options.config.assets;
		if (!assets) {
			return [];
		}

		let assetDirectory = resolveAssetDirectory(
			options.dev?.rootPath,
			assets.directory
		);
		const directoryStats = await fs.stat(assetDirectory).catch((err) => {
			if (err?.code === "ENOENT") {
				return undefined;
			}
			throw err;
		});
		if (!directoryStats) {
			// If the assets directory doesn't exist yet (e.g. the build output
			// hasn't been generated), serve zero assets from an empty directory.
			// It lives inside this instance's temporary directory so `dispose()`
			// and the exit hook remove it, and its fixed path lets repeated
			// `getServices()` calls reuse it. Workers can share it because it is
			// always empty and the assets service only reads it.
			assetDirectory = path.join(tmpPath, ASSETS_PLUGIN_NAME, "empty");
			await fs.mkdir(assetDirectory, { recursive: true });
		}

		// Rejected here, as wrangler would, rather than when workerd loads.
		if (Array.isArray(assets.runWorkerFirst)) {
			parseStaticRouting(assets.runWorkerFirst);
		}
		// Only to reject an `.assetsignore` that cannot be read as patterns.
		await createAssetsIgnoreFunction(assetDirectory).catch((error: unknown) => {
			if (error instanceof InvalidAssetsIgnoreError) {
				throw new MiniflareCoreError("ERR_VALIDATION", error.message);
			}
			throw error;
		});
		const read = (file: string) => maybeGetFile(join(assetDirectory, file));
		// The config of workerd's assets service.
		const assetConfig = {
			html_handling: assets.htmlHandling,
			not_found_handling: assets.notFoundHandling,
			base_path: assets.basePath,
			run_worker_first: assets.runWorkerFirst,
			headers: read(HEADERS_FILENAME),
			redirects: read(REDIRECTS_FILENAME),
			ignore: read(CF_ASSETS_IGNORE_FILENAME),
			debug: true,
		};

		const id = options.config.name;
		// workerd's assets service routes each request to the User Worker or to a
		// file, and sends the User Worker every other event (RPC, scheduled, tail).
		// `has_user_worker` comes from the explicit `assets.hasUserWorker` flag:
		// wrangler injects a placeholder script for assets-only workers.
		const routerService: Service = {
			name: `${ROUTER_SERVICE_NAME}:${id}`,
			assets: {
				path: assetDirectory,
				config: JSON.stringify(assetConfig),
				...(assets.hasUserWorker
					? { userWorker: { name: getUserServiceName(id) } }
					: {
							compatibilityDate:
								options.config.compatibilityDate ?? FALLBACK_COMPATIBILITY_DATE,
							compatibilityFlags: options.config.compatibilityFlags,
						}),
			},
		};
		return [routerService];
	},
};
