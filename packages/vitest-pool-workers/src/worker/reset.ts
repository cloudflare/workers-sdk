import workerdUnsafe from "workerd:unsafe";

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();

	// Reset ratelimit binding state registered by the miniflare ratelimit module.
	// The module sets globalThis.__cfRatelimitInstances__ when it is first loaded,
	// so this is a no-op when no ratelimit bindings are configured.
	const ratelimitInstances = (
		globalThis as { __cfRatelimitInstances__?: Set<{ reset(): void }> }
	).__cfRatelimitInstances__;
	if (ratelimitInstances !== undefined) {
		for (const instance of ratelimitInstances) {
			instance.reset();
		}
	}
}

export async function abortAllDurableObjects(): Promise<void> {
	await workerdUnsafe.abortAllDurableObjects();
}
