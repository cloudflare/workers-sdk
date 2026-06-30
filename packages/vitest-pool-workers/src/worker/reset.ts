import workerdUnsafe from "workerd:unsafe";
import type { DurableObjectEvictionOptions } from "workerd:unsafe";

const DEFAULT_EVICTION_OPTIONS: DurableObjectEvictionOptions = {
	webSockets: "hibernate",
};

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();

	// Reset ratelimit binding state. The miniflare ratelimit extension module is
	// marked `internal: true` in workerd, so it cannot be imported directly.
	// Instead the module registers a reset function on globalThis when loaded,
	// which is a no-op when no RATE_LIMITERS bindings are configured.
	const resetRatelimits = (globalThis as { __cfRatelimitReset__?: () => void })
		.__cfRatelimitReset__;
	resetRatelimits?.();
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
