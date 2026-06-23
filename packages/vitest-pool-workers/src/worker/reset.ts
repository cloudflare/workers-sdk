import workerdUnsafe from "workerd:unsafe";

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();
}

export async function abortAllDurableObjects(): Promise<void> {
	await workerdUnsafe.abortAllDurableObjects();
}

// See public facing `cloudflare:test` types for docs
export async function evictAllDurableObjects(): Promise<void> {
	await workerdUnsafe.evictAllDurableObjects();
}
