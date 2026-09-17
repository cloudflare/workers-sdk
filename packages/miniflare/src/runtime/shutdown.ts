import type { ChildProcess } from "node:child_process";

/**
 * Terminates a workerd process, allowing container-enabled runtimes to clean up
 * before falling back to a forced exit.
 *
 * @param runtimeProcess - Spawned workerd child process.
 * @param processExitPromise - Promise resolved when the child exits.
 * @param gracefulShutdown - Whether workerd must be given time to clean up.
 */
export async function terminateRuntimeProcess(
	runtimeProcess: ChildProcess,
	processExitPromise: Promise<void>,
	gracefulShutdown: boolean
): Promise<void> {
	if (!gracefulShutdown) {
		// `kill()` uses `SIGTERM` by default. In `workerd`, this waits for HTTP
		// connections to close before exiting. Notably, Chrome sometimes keeps
		// connections open for about 10s, blocking exit. We'd like `dispose()`/
		// `setOptions()` to immediately terminate the existing process.
		// Therefore, use `SIGKILL` which force closes all connections.
		// See https://github.com/cloudflare/workerd/pull/244.
		runtimeProcess.kill("SIGKILL");
		await processExitPromise;
		return;
	}

	// Container cleanup is owned by workerd and requires a graceful shutdown while
	// its Docker connection is still alive. Bound the wait so open HTTP connections
	// cannot indefinitely block Miniflare disposal.
	runtimeProcess.kill("SIGTERM");
	const forceKillTimeout = setTimeout(
		() => runtimeProcess.kill("SIGKILL"),
		5_000
	);
	forceKillTimeout.unref();
	try {
		await processExitPromise;
	} finally {
		clearTimeout(forceKillTimeout);
	}
}
