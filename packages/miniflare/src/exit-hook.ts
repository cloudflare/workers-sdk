/**
 * Lightweight replacement for the `exit-hook` npm package.
 *
 * The third-party `exit-hook` registers a permanent `process.on("message")`
 * listener (for PM2 cluster-shutdown support) that is never removed.  In
 * Node.js, having a `"message"` listener refs the IPC channel handle, which
 * keeps the event loop alive.  When Miniflare runs inside a `node --test`
 * child process (which communicates with its parent over IPC), this prevents
 * the process from exiting after all tests complete.
 *
 * This module tracks the number of active registrations and removes **all**
 * process listeners once the last registration is unregistered, allowing the
 * process to exit cleanly.
 */

const callbacks = new Set<() => void>();
let registered = false;
let called = false;

function runCallbacks(): void {
	if (called) {
		return;
	}
	called = true;
	for (const callback of callbacks) {
		callback();
	}
}

function onExit(): void {
	runCallbacks();
}

function onSignalInt(): void {
	runCallbacks();
	// eslint-disable-next-line unicorn/no-process-exit -- intentional: replicate default SIGINT behavior
	process.exit(128 + 2);
}

function onSignalTerm(): void {
	runCallbacks();
	// eslint-disable-next-line unicorn/no-process-exit -- intentional: replicate default SIGTERM behavior
	process.exit(128 + 15);
}

function onMessage(message: unknown): void {
	if (message === "shutdown") {
		runCallbacks();
		// eslint-disable-next-line unicorn/no-process-exit -- intentional: PM2 graceful shutdown
		process.exit(0);
	}
}

function addListeners(): void {
	registered = true;
	called = false;
	process.on("exit", onExit);
	process.on("SIGINT", onSignalInt);
	process.on("SIGTERM", onSignalTerm);
	// Only listen for IPC "shutdown" messages (PM2 support) when the process
	// actually has an IPC channel.  Even without this guard the listener is
	// harmless when there is no channel, but being explicit avoids any
	// accidental ref of a future channel.
	if (process.send !== undefined) {
		process.on("message", onMessage);
	}
}

function removeListeners(): void {
	registered = false;
	process.removeListener("exit", onExit);
	process.removeListener("SIGINT", onSignalInt);
	process.removeListener("SIGTERM", onSignalTerm);
	process.removeListener("message", onMessage);
}

/**
 * Register a callback to run when the process exits.  Returns a function
 * that unregisters the callback.  When the last callback is unregistered,
 * all underlying process listeners are removed so they cannot keep the
 * event loop alive.
 */
export function exitHook(callback: () => void): () => void {
	callbacks.add(callback);

	if (!registered) {
		addListeners();
	}

	return () => {
		callbacks.delete(callback);
		if (callbacks.size === 0 && registered) {
			removeListeners();
		}
	};
}
