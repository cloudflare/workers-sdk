import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import SCRIPT_CACHE_ENTRY_NOOP from "worker:cache/cache-entry-noop";
import SCRIPT_CACHE_SITES from "worker:cache/cache-sites";
import { getPersistPath } from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const CACHE_PLUGIN_NAME = "cache";
const CACHE_DIRECTORY_SERVICE_NAME = `${CACHE_PLUGIN_NAME}:directory`;

export function getCacheServiceName(workerIndex: number) {
	return `${CACHE_PLUGIN_NAME}:${workerIndex}`;
}

/** The directory workerd's `cache` services keep their entries in. */
export function getCachePath(
	tmpPath: string,
	isolatedResourcePersistencePath: string | undefined
) {
	return getPersistPath(
		CACHE_PLUGIN_NAME,
		tmpPath,
		isolatedResourcePersistencePath
	);
}

/**
 * Removes every entry of the cache `name`, or of the default cache, from the
 * cache directory `dir`. A cache's entries are the files of its subdirectory:
 * `default`, or the SHA-256 of its name in hex. Answers how many it removed.
 */
export async function purgeCacheDirectory(
	dir: string,
	name?: string
): Promise<number> {
	const cache = path.join(
		dir,
		name === undefined
			? "default"
			: crypto.createHash("sha256").update(name).digest("hex")
	);
	const names = await fs.readdir(cache).catch(() => []);
	await removeDir(cache);
	return names.filter((name) => /^[0-9a-f]{64}$/.test(name)).length;
}

function worker(
	name: string,
	script: string,
	esModule: string,
	bindings: Worker_Binding[] = []
): Service {
	return {
		name,
		worker: {
			compatibilityDate: "2023-07-24",
			compatibilityFlags: ["nodejs_compat", "experimental"],
			modules: [{ name: `${script}.worker.js`, esModule }],
			bindings,
		},
	};
}

export const CACHE_PLUGIN: Plugin = {
	getBindings() {
		return [];
	},
	getNodeBindings() {
		return {};
	},
	async getServices({ options, workerIndex, tmpPath, sharedOptions }) {
		const name = getCacheServiceName(workerIndex);
		if (!(options.dev?.cacheAPI ?? true)) {
			return [worker(name, "cache-entry-noop", SCRIPT_CACHE_ENTRY_NOOP())];
		}
		// Every Worker's `cache` service names this one directory, so they share
		// one cache, as they shared one Durable Object before.
		const cachePath = getCachePath(
			tmpPath,
			sharedOptions.isolatedResourcePersistencePath
		);
		await fs.mkdir(cachePath, { recursive: true });
		const cache = { path: cachePath };
		if (options.legacy?.sitePath === undefined) {
			return [{ name, cache }];
		}
		const sites = worker(name, "cache-sites", SCRIPT_CACHE_SITES(), [
			{ name: "CACHE", service: { name: CACHE_DIRECTORY_SERVICE_NAME } },
		]);
		return [sites, { name: CACHE_DIRECTORY_SERVICE_NAME, cache }];
	},
};
