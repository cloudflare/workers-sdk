/**
 * Lightweight replacement for the `exit-hook` npm package.
 *
 * The third-party `exit-hook` registers process listeners (`exit`, `SIGINT`,
 * `SIGTERM`, and `message`) that are never removed — even after every
 * callback has been unregistered.  Those dangling listeners are harmless in
 * long-running processes, but in short-lived child processes (e.g. those
 * spawned by `node --test`) they can prevent clean exit by holding refs on
 * handles such as the IPC channel.
 *
 * This module tracks the number of active registrations and removes **all**
 * process listeners once the last registration is unregistered, so they
 * cannot keep the event loop alive after dispose.
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
