import workerdUnsafe from "workerd:unsafe";
import type { DurableObjectEvictionOptions } from "workerd:unsafe";

const DEFAULT_EVICTION_OPTIONS: DurableObjectEvictionOptions = {
	webSockets: "hibernate",
};

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();
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
