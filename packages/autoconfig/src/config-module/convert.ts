/**
 * Convert the Wrangler `RawConfig` that autoconfig assembles for a new project
 * into the new programmatic config format: the `cloudflare.config.ts` worker
 * shape (consumed by {@link serializeCloudflareConfig}) plus the Vite-owned
 * tooling fields.
 *
 * This deliberately covers only the fields autoconfig itself generates — its
 * base config (`name`, `compatibility_date`, `compatibility_flags`,
 * `observability`) plus the values frameworks return from `configure()`
 * (`main`, `assets`). It is NOT a general-purpose `wrangler.jsonc` converter:
 * autoconfig only ever writes config for a brand-new project, so binding,
 * trigger, Durable Object migration, etc. fields never appear here.
 */
import type { RawConfig } from "@cloudflare/workers-utils";

type Obj = Record<string, unknown>;

export interface CloudflareConfigSplit {
	/** Runtime config → `cloudflare.config.ts` (`defineWorker`). */
	worker: Obj;
	/** Tooling fields owned by Vite (e.g. the assets directory). */
	tooling: Obj;
}

/** Assign `value` to `obj[key]` only when it is not `undefined`. */
function set(obj: Obj, key: string, value: unknown): void {
	if (value !== undefined) {
		obj[key] = value;
	}
}

/**
 * Split the config autoconfig generated into the runtime worker config and the
 * Vite-owned tooling fields.
 */
export function toCloudflareConfig(raw: RawConfig): CloudflareConfigSplit {
	const worker: Obj = {};
	const tooling: Obj = {};

	set(worker, "name", raw.name);
	set(worker, "entrypoint", raw.main);
	set(worker, "compatibilityDate", raw.compatibility_date);
	set(worker, "compatibilityFlags", raw.compatibility_flags);

	if (raw.observability !== undefined) {
		const observability: Obj = {};
		set(observability, "enabled", raw.observability.enabled);
		set(
			observability,
			"headSamplingRate",
			raw.observability.head_sampling_rate
		);
		worker.observability = observability;
	}

	if (raw.assets !== undefined) {
		// The runtime serving options live under `assets`; the directory is a
		// build-time (Vite-owned) tooling concern; an `assets.binding` is
		// exposed to the Worker as an `env` entry.
		const assets: Obj = {};
		set(assets, "htmlHandling", raw.assets.html_handling);
		set(assets, "notFoundHandling", raw.assets.not_found_handling);
		set(assets, "runWorkerFirst", raw.assets.run_worker_first);
		if (Object.keys(assets).length > 0) {
			worker.assets = assets;
		}
		if (raw.assets.binding) {
			worker.env = { [raw.assets.binding]: { type: "assets" } };
		}
		set(tooling, "assetsDirectory", raw.assets.directory);
	}

	return { worker, tooling };
}
