import workerdUnsafe from "workerd:unsafe";
import type { DurableObjectEvictionOptions } from "workerd:unsafe";

const DEFAULT_EVICTION_OPTIONS: DurableObjectEvictionOptions = {
	webSockets: "hibernate",
};

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();

	// Reset ratelimit binding state. The miniflare ratelimit extension module
	// runs in the same isolate as this worker (internal modules run inside the
	// caller's isolate), so globalThis is shared. The module registers a reset
	// hook under a well-known Symbol on load; calling it here is a no-op when
	// no ratelimit bindings are configured.
	const RATELIMIT_RESET_SYMBOL = Symbol.for(
		"cloudflare:miniflare:ratelimit:reset"
	);
	const resetRatelimits = (
		globalThis as Record<symbol, (() => void) | undefined>
	)[RATELIMIT_RESET_SYMBOL];
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
