import type { ChildProcess } from "node:child_process";

const DEFAULT_FORCE_KILL_AFTER_MS = 5_000;

export interface ChildProcessControllerOptions {
	/** Forward SIGINT and SIGTERM to the child until it exits. */
	forwardSignals?: boolean;
	/**
	 * Time to wait after requesting shutdown before sending SIGKILL.
	 * Set to `null` to leave graceful shutdown timing to the child.
	 */
	forceKillAfterMs?: number | null;
}

export interface ChildProcessExit {
	code: number | null;
	signal: NodeJS.Signals | null;
}

export interface ChildProcessController {
	/** Rejects on a process error; otherwise resolves when the child exits. */
	exited: Promise<ChildProcessExit>;
	readonly terminationRequested: boolean;
	/** Request graceful shutdown, with the configured forced-shutdown fallback. */
	terminate(signal?: NodeJS.Signals): void;
}

/**
 * Observe and control an existing child process.
 */
export function createChildProcessController(
	child: ChildProcess,
	options: ChildProcessControllerOptions = {}
): ChildProcessController {
	let terminationRequested = false;
	let forceKillTimer: NodeJS.Timeout | undefined;
	const forceKillAfterMs =
		options.forceKillAfterMs === undefined
			? DEFAULT_FORCE_KILL_AFTER_MS
			: options.forceKillAfterMs;

	const terminate = (signal: NodeJS.Signals = "SIGTERM"): void => {
		if (
			child.exitCode !== null ||
			child.signalCode !== null ||
			terminationRequested
		) {
			return;
		}

		terminationRequested = true;
		child.kill(signal);
		if (signal !== "SIGKILL" && forceKillAfterMs !== null) {
			forceKillTimer = setTimeout(() => {
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGKILL");
				}
			}, forceKillAfterMs);
			forceKillTimer.unref();
		}
	};

	const forwardSignal = (signal: NodeJS.Signals): void => {
		if (terminationRequested) {
			child.kill("SIGKILL");
			return;
		}
		terminate(signal);
	};
	const onSigInt = (): void => forwardSignal("SIGINT");
	const onSigTerm = (): void => forwardSignal("SIGTERM");
	const cleanup = (): void => {
		if (forceKillTimer) {
			clearTimeout(forceKillTimer);
		}
		process.removeListener("SIGINT", onSigInt);
		process.removeListener("SIGTERM", onSigTerm);
		child.removeListener("error", onError);
		child.removeListener("exit", onExit);
	};

	let resolveExit!: (result: ChildProcessExit) => void;
	let rejectExit!: (error: Error) => void;
	const exited = new Promise<ChildProcessExit>((resolve, reject) => {
		resolveExit = resolve;
		rejectExit = reject;
	});
	const onError = (error: Error): void => {
		cleanup();
		rejectExit(error);
	};
	const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
		cleanup();
		resolveExit({ code, signal });
	};

	if (child.exitCode !== null || child.signalCode !== null) {
		resolveExit({ code: child.exitCode, signal: child.signalCode });
	} else {
		child.once("error", onError);
		child.once("exit", onExit);
		if (options.forwardSignals) {
			process.on("SIGINT", onSigInt);
			process.on("SIGTERM", onSigTerm);
		}
	}

	// A caller may use only terminate(); keep a later process error from becoming
	// an unhandled rejection while preserving it for consumers that await exit.
	void exited.catch(() => {});

	return {
		exited,
		get terminationRequested() {
			return terminationRequested;
		},
		terminate,
	};
}
