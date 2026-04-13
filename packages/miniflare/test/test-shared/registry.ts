import { getWorkerRegistry } from "miniflare";

/**
 * Poll the dev registry until all expected workers are registered.
 * This avoids flakey tests that rely on fixed timeouts.
 */
export async function waitForWorkersInRegistry(
	registryPath: string,
	expectedWorkers: string[],
	timeoutMs = 5000
): Promise<void> {
	const startTime = Date.now();
	while (Date.now() - startTime < timeoutMs) {
		const registry = getWorkerRegistry(registryPath);
		const registeredWorkers = Object.keys(registry);
		if (expectedWorkers.every((w) => registeredWorkers.includes(w))) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(
		`Timed out waiting for workers to register: ${expectedWorkers.join(", ")}`
	);
}
