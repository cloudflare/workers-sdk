import type { Request, Response } from "miniflare";
import type { Unstable_ASSETSBindingsOptions } from "wrangler";

// Track all AbortControllers created by buildPagesASSETSBinding so they can
// be cleaned up when the last pool worker stops. This is necessary because
// vitest evaluates all project configs at startup (to discover the workspace),
// even for projects that won't run — so the watchers are created before any
// pool worker exists, and the creating project's pool worker may never start.
const registeredControllers = new Set<AbortController>();

// Reference count of active pool workers. Watchers are only closed when the
// last worker stops, so that early-finishing workers don't kill watchers that
// later workers (or other projects in the workspace) still need.
let activeWorkers = 0;

export function poolWorkerStarted(): void {
	activeWorkers++;
}

export function poolWorkerStopped(): void {
	activeWorkers--;
	if (activeWorkers <= 0) {
		activeWorkers = 0;
		for (const ac of registeredControllers) {
			ac.abort();
		}
		registeredControllers.clear();
	}
}

export async function buildPagesASSETSBinding(
	assetsPath: string
): Promise<(request: Request) => Promise<Response>> {
	// noinspection SuspiciousTypeOfGuard
	if (typeof assetsPath !== "string") {
		throw new TypeError(
			"Failed to execute 'buildPagesASSETSBinding': parameter 1 is not of type 'string'."
		);
	}

	const { unstable_generateASSETSBinding } = await import("wrangler"); // (lazy)

	// Create the AbortController after the import succeeds so we don't leak
	// a registered controller if the import throws.
	const ac = new AbortController();
	registeredControllers.add(ac);

	const log = {
		...console,
		debugWithSanitization: console.debug,
		loggerLevel: "info",
		columns: process.stdout.columns,
	} as unknown as Unstable_ASSETSBindingsOptions["log"];
	return unstable_generateASSETSBinding({
		log,
		directory: assetsPath,
		signal: ac.signal,
	});
}
