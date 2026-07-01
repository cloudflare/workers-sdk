import { env } from "cloudflare:workers";
import workerdUnsafe from "workerd:unsafe";
import type { DurableObjectEvictionOptions } from "workerd:unsafe";

const DEFAULT_EVICTION_OPTIONS: DurableObjectEvictionOptions = {
	webSockets: "hibernate",
};

// Matches RATELIMIT_CONTROL_BINDING_NAME in miniflare's ratelimit plugin.
const RATELIMIT_CONTROL_BINDING_NAME = "__MINIFLARE_RATELIMIT_CONTROL__";

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();

	// Only present when the worker has at least one ratelimit binding
	// configured (see miniflare's ratelimit plugin `getBindings()`).
	const ratelimitControl = env[RATELIMIT_CONTROL_BINDING_NAME] as unknown as
		| { resetAll?: () => void }
		| undefined;
	ratelimitControl?.resetAll?.();
}

export async function abortAllDurableObjects(): Promise<void> {
	await workerdUnsafe.abortAllDurableObjects();
}

// See public facing `cloudflare:test` types for docs
export async function evictAllDurableObjects(
	options: DurableObjectEvictionOptions = DEFAULT_EVICTION_OPTIONS
): Promise<void> {
	await workerdUnsafe.evictAllDurableObjects(options);
}
