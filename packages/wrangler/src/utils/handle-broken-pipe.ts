import process from "node:process";

/**
 * Error codes that mean "the thing we were writing to has gone away".
 *
 * `EPIPE` is the reader closing the pipe (`wrangler whoami | head`).
 * `ERR_STREAM_DESTROYED` is the same situation observed a tick later, once
 * Node has torn the stream down.
 */
const BROKEN_PIPE_CODES = new Set(["EPIPE", "ERR_STREAM_DESTROYED"]);

/**
 * Make Wrangler exit quietly when its output stream is closed early.
 *
 * Node ignores `SIGPIPE`, so writing to a closed stdout/stderr surfaces as an
 * asynchronous `error` event rather than terminating the process the way a
 * normal Unix CLI would. With no listener attached, that becomes an uncaught
 * exception, and in released builds the uncaught-exception path is Sentry's
 * `logAndExitProcess`, which does two things in this order:
 *
 * 1. `console.error(error)` — written to the stream that just failed, raising
 *    another asynchronous `EPIPE`;
 * 2. `client.close(timeout).then(() => process.exit(1))` — so the exit is
 *    deferred behind a transport flush of up to 2 seconds.
 *
 * The second `EPIPE` therefore lands back in the handler long before the
 * process is allowed to die, and the cycle repeats. Each turn allocates a fresh
 * `Error` with a captured stack, so this is not a busy loop that eventually
 * exits: it exhausts the V8 heap and aborts. `wrangler whoami 2>&1 | head`
 * reliably produced a multi-gigabyte out-of-memory crash (and, on Linux, a
 * core dump containing the user's account data and credentials).
 *
 * Note that this only reproduces against a build with `SENTRY_DSN` set, i.e.
 * published releases — a plain `pnpm build` leaves Sentry uninitialised.
 *
 * Attaching an `error` listener to both stdio streams is enough to break the
 * cycle: the first broken-pipe error stops output and exits, matching what
 * users expect from `| head`, `| less` or a CI runner that stopped reading.
 *
 * Only called from `cli.ts` when Wrangler is run as a binary — the programmatic
 * API (`unstable_dev` and friends) must not install process-wide exit handlers
 * on its embedder's behalf.
 *
 * @param streams The streams to guard. Defaults to `process.stdout` and
 * `process.stderr`; overridable for testing.
 * @param onBrokenPipe Invoked on the first broken-pipe error. Defaults to
 * exiting the process; overridable for testing.
 */
export function handleBrokenPipe(
	streams: NodeJS.EventEmitter[] = [process.stdout, process.stderr],
	onBrokenPipe: () => void = () => process.exit(0)
): void {
	for (const stream of streams) {
		stream.on("error", (error: NodeJS.ErrnoException) => {
			if (BROKEN_PIPE_CODES.has(error?.code ?? "")) {
				onBrokenPipe();
				return;
			}
			// Not a broken pipe, so this is a genuine stdio failure we have
			// nothing useful to say about. Re-throw to preserve the previous
			// behaviour of surfacing it as an uncaught exception.
			throw error;
		});
	}
}
