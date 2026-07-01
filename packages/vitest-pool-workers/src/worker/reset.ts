import ratelimitBindingNames from "__VITEST_POOL_WORKERS_RATELIMIT_BINDING_NAMES";
import { env } from "cloudflare:workers";
import workerdUnsafe from "workerd:unsafe";
import type { DurableObjectEvictionOptions } from "workerd:unsafe";

const DEFAULT_EVICTION_OPTIONS: DurableObjectEvictionOptions = {
	webSockets: "hibernate",
};

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();

	// Ratelimit bindings expose a `reset()` method directly (see
	// `ratelimit.worker.ts`). Binding names come from the parsed wrangler
	// config (see `pool/index.ts`), so we never need to guess or enumerate
	// unrelated bindings in `env`.
	for (const name of ratelimitBindingNames) {
		const binding = env[name] as unknown as { reset?: () => void };
		binding.reset?.();
	}
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
