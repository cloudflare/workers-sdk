import {
	configFileName,
	createFatalError,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getLegacyScriptName } from "../utils/getLegacyScriptName";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import { printWranglerBanner } from "../wrangler-banner";
import { getWorkerForZone } from "../zones";
import {
	createTail,
	jsonPrintLogs,
	prettyPrintLogs,
	translateCLICommandToFilterMessage,
} from "./createTail";
import type { TailCLIFilters } from "./createTail";
import type WebSocket from "ws";

/**
 * The WebSocket close code that indicates the peer (the tail backend) ended
 * the session cleanly. Anything else is treated as an unexpected disconnect.
 */
const NORMAL_CLOSURE = 1000;

/** How long to wait between pings on the keepalive websocket (ms). */
const PING_INTERVAL_MS = 10_000;

/** Backoff delays between successive reconnect attempts (ms). */
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

/** How many reconnect attempts we'll make before giving up. */
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;

/**
 * Promise-returning sleep using the global `setTimeout` (rather than the one
 * from `node:timers/promises`) so it can be controlled by `vi.useFakeTimers`
 * in tests.
 */
function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

export const tailCommand = createCommand({
	metadata: {
		description: "🦚 Start a log tailing session for a Worker",
		status: "stable",
		owner: "Workers: Workers Observability",
		category: "Compute & AI",
	},
	positionalArgs: ["worker"],
	args: {
		worker: {
			describe: "Name or route of the worker to tail",
			type: "string",
		},
		format: {
			choices: ["json", "pretty"],
			describe: "The format of log entries",
		},
		status: {
			choices: ["ok", "error", "canceled"],
			describe: "Filter by invocation status",
			array: true,
		},
		header: {
			type: "string",
			requiresArg: true,
			describe: "Filter by HTTP header",
		},
		method: {
			type: "string",
			requiresArg: true,
			describe: "Filter by HTTP method",
			array: true,
		},
		"sampling-rate": {
			type: "number",
			describe: "Adds a percentage of requests to log sampling rate",
		},
		search: {
			type: "string",
			requiresArg: true,
			describe: "Filter by a text match in console.log messages",
		},
		ip: {
			type: "string",
			requiresArg: true,
			describe:
				'Filter by the IP address the request originates from. Use "self" to filter for your own IP',
			array: true,
		},
		"version-id": {
			type: "string",
			requiresArg: true,
			describe: "Filter by Worker version",
		},
		debug: {
			type: "boolean",
			hidden: true,
			default: false,
			describe:
				"If a log would have been filtered out, send it through anyway alongside the filter which would have blocked it.",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
	},
	behaviour: {
		supportTemporary: true,
		printBanner: false,
	},
	async handler(args, { config }) {
		args.format ??= process.stdout.isTTY ? "pretty" : "json";
		if (args.format === "pretty") {
			await printWranglerBanner();
		}

		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages deployment tail` instead.",
				{ telemetryMessage: "tail stream pages project" }
			);
		}
		metrics.sendMetricsEvent("begin log stream", {
			sendMetrics: config.send_metrics,
		});

		let scriptName: string | undefined;

		const accountId = await requireAuth(config);

		// Worker names can't contain "." (and most routes should), so use that as a discriminator
		if (args.worker?.includes(".")) {
			scriptName = await getWorkerForZone(
				config,
				{
					worker: args.worker,
					accountId,
				},
				config.configPath
			);
			if (args.format === "pretty") {
				logger.log(
					`Connecting to worker ${scriptName} at route ${args.worker}`
				);
			}
		} else {
			scriptName = getLegacyScriptName({ name: args.worker, ...args }, config);
		}

		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`wrangler tail <worker-name>\``,
				{ telemetryMessage: "tail stream missing worker name" }
			);
		}

		const cliFilters: TailCLIFilters = {
			status: args.status as ("ok" | "error" | "canceled")[] | undefined,
			header: args.header,
			method: args.method,
			samplingRate: args.samplingRate,
			search: args.search,
			clientIp: args.ip,
			versionId: args.versionId,
		};

		const filters = translateCLICommandToFilterMessage(cliFilters);

		const scriptDisplayName = `${scriptName}${
			useServiceEnvironments(config) && args.env ? ` (${args.env})` : ""
		}`;

		const printLog: (data: WebSocket.RawData) => void =
			args.format === "pretty" ? prettyPrintLogs : jsonPrintLogs;

		// Lifecycle state shared across reconnect attempts.
		let isShuttingDown = false;
		let attempt = 0;

		// Per-connection state, replaced on each (re)connect.
		let currentTail: WebSocket | undefined;
		let currentDeleteTail: (() => Promise<void>) | undefined;
		let cancelPing: (() => void) | undefined;
		// Set to `true` while we are intentionally tearing down the current
		// connection — used to suppress the `close` handler so it doesn't
		// race with reconnect/shutdown logic that already has things in hand.
		let intentionalClose = false;

		// The handler returns this promise. It resolves on a clean stop (Ctrl-C
		// or a normal server close) and rejects when we have given up after
		// exhausting all reconnect attempts. Rejection propagates through the
		// normal yargs/main error pipeline → `cli.ts` translates it to a
		// non-zero process exit (test-safe: no `process.exit()` here).
		let resolveDone!: () => void;
		let rejectDone!: (reason: unknown) => void;
		const done = new Promise<void>((resolve, reject) => {
			resolveDone = resolve;
			rejectDone = reject;
		});

		// `scriptName` is guaranteed to be set after the check above; alias to
		// a non-nullable local for use inside `connect()`.
		const workerName = scriptName;

		/**
		 * Open a single tail connection.
		 *
		 * - Throws on the initial-connect path so first-attempt failures surface
		 *   through the normal handler-throws pipeline (preserves existing
		 *   `Connection … closed unexpectedly.` behaviour).
		 * - On subsequent reconnects we catch the throw and schedule another
		 *   reconnect attempt instead.
		 */
		async function connect(): Promise<void> {
			const { tail, expiration, deleteTail } = await createTail(
				config,
				accountId,
				workerName,
				filters,
				args.debug,
				useServiceEnvironments(config) ? args.env : undefined
			);

			// We may have started shutting down (Ctrl-C / SIGTERM, or a clean
			// stop) while `createTail()` was in flight. If so, `shutdownHandler`
			// has already run with `currentTail === undefined` and settled
			// `done`, so adopting this socket would orphan it — it would never
			// be terminated and its server-side tail never deleted, keeping the
			// event loop alive. Tear the just-created connection down and bail.
			if (isShuttingDown) {
				try {
					tail.terminate();
				} catch {
					// Ignore: the socket may already be closed/closing.
				}
				try {
					await deleteTail();
				} catch (e) {
					logger.debug("Tail: failed to delete tail on the server:", e);
				}
				return;
			}

			currentTail = tail;
			currentDeleteTail = deleteTail;
			intentionalClose = false;
			// Tracks whether this connection ever transitioned to OPEN. Used to
			// distinguish "close before we connected" (which should bubble up
			// as an error / trigger reconnect via the throw path) from "close
			// while streaming" (which routes through cleanStop / reconnect).
			let hasOpened = false;

			if (attempt === 0 && args.format === "pretty") {
				logger.log(
					`Successfully created tail, expires at ${expiration.toLocaleString()}`
				);
			}

			// NOTE: The tail backend does not actively close this WebSocket
			// when the expiration time is reached — log delivery just stops.
			// A proactive client-side refresh based on `expiration` is tracked
			// as a follow-up in
			// https://github.com/cloudflare/workers-sdk/issues/14427.

			tail.on("message", printLog);

			// Hooks used by the open-wait promise below. The close listener
			// rejects the wait if close fires before open; the open listener
			// resolves it. Both are reset to `undefined` after the wait so
			// the steady-state close handler can take over.
			let resolveOpenWait: (() => void) | undefined;
			let rejectOpenWait: ((err: Error) => void) | undefined;

			tail.on("close", (code: number) => {
				// Close fired before this connection ever opened.
				if (!hasOpened) {
					if (intentionalClose || isShuttingDown) {
						// Tear-down beat us to the open event (e.g. Ctrl-C
						// during the initial handshake). Don't reject — unblock
						// the open-wait so `connect()` can return cleanly via
						// its `isShuttingDown` check below. `cleanStop` /
						// `shutdownHandler` have already settled `done`.
						resolveOpenWait?.();
					} else {
						rejectOpenWait?.(
							new Error(
								`Connection to ${scriptDisplayName} closed unexpectedly.`
							)
						);
					}
					return;
				}
				// Steady-state path.
				if (intentionalClose || isShuttingDown) {
					return;
				}
				if (code === NORMAL_CLOSURE) {
					void cleanStop();
				} else {
					void scheduleReconnect();
				}
			});

			// Wait for the connection to actually open. The `open` and `close`
			// events fire on this WebSocket — whichever happens first wins.
			if (tail.readyState !== tail.OPEN) {
				await new Promise<void>((resolve, reject) => {
					resolveOpenWait = resolve;
					rejectOpenWait = reject;
					tail.on("open", () => {
						resolveOpenWait?.();
					});
				});
			}
			// Clear the open-wait hooks so the close handler can switch to
			// its steady-state behaviour.
			resolveOpenWait = undefined;
			rejectOpenWait = undefined;

			if (isShuttingDown || tail !== currentTail) {
				return;
			}

			hasOpened = true;

			if (args.format === "pretty") {
				if (attempt === 0) {
					logger.log(`Connected to ${scriptDisplayName}, waiting for logs...`);
				} else {
					logger.log(`Reconnected to ${scriptDisplayName}.`);
				}
			}

			// Successful connection — reset the reconnect counter.
			attempt = 0;
			cancelPing = startWebSocketPing(tail, scheduleReconnect);
		}

		/**
		 * Tear down the current connection so we can either reconnect or shut
		 * down cleanly. This is best-effort: failures deleting the server-side
		 * tail are logged but don't prevent the next step.
		 */
		async function teardownCurrentConnection(): Promise<void> {
			cancelPing?.();
			cancelPing = undefined;
			intentionalClose = true;
			const tail = currentTail;
			const deleteTail = currentDeleteTail;
			currentTail = undefined;
			currentDeleteTail = undefined;
			try {
				tail?.terminate();
			} catch {
				// Ignore: the socket may already be closed/closing.
			}
			if (deleteTail) {
				try {
					await deleteTail();
				} catch (e) {
					logger.debug("Tail: failed to delete tail on the server:", e);
				}
			}
		}

		/**
		 * Called when the active connection drops unexpectedly (ping timeout or
		 * abnormal close). Tears the current connection down, then either
		 * waits + reconnects or gives up after `MAX_RECONNECT_ATTEMPTS` tries.
		 */
		async function scheduleReconnect(): Promise<void> {
			if (isShuttingDown) {
				return;
			}
			await teardownCurrentConnection();
			if (isShuttingDown) {
				return;
			}

			attempt++;
			if (attempt > MAX_RECONNECT_ATTEMPTS) {
				// Match every other terminal path (`cleanStop`,
				// `shutdownHandler`, the initial-connect catch) and remove
				// the SIGINT/SIGTERM listeners before settling `done`.
				// Otherwise this branch leaks listeners on `process`, which
				// matters for in-process callers like `runWrangler` in tests.
				removeSignalHandlers();
				// Pair the `"begin log stream"` metric sent at handler start
				// with an `"end log stream"` here too, so the give-up path
				// shows up symmetrically in telemetry alongside the
				// `cleanStop` / `shutdownHandler` exit paths.
				metrics.sendMetricsEvent("end log stream", {
					sendMetrics: config.send_metrics,
				});
				rejectDone(
					createFatalError(
						`Unable to reconnect to the tail for ${scriptDisplayName} after ${MAX_RECONNECT_ATTEMPTS} attempts. Please re-run \`wrangler tail${args.worker ? ` ${args.worker}` : ""}\` to start a new session.`,
						args.format === "json",
						{ code: 1, telemetryMessage: "tail stream disconnected" }
					)
				);
				return;
			}

			const delay =
				RECONNECT_BACKOFF_MS[attempt - 1] ??
				RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1];
			logger.warn(
				`Tail connection lost. Reconnecting (attempt ${attempt} of ${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000}s...`
			);
			try {
				await sleep(delay);
			} catch {
				// `sleep` rejects when its `AbortSignal` fires; we don't pass one,
				// but guard anyway so a future change can't break the loop.
				return;
			}
			if (isShuttingDown) {
				return;
			}

			try {
				await connect();
			} catch (e) {
				logger.debug("Tail: reconnect attempt failed:", e);
				void scheduleReconnect();
			}
		}

		/** Resolve `done` after a clean server-initiated shutdown (code 1000). */
		async function cleanStop(): Promise<void> {
			if (isShuttingDown) {
				return;
			}
			isShuttingDown = true;
			await teardownCurrentConnection();
			metrics.sendMetricsEvent("end log stream", {
				sendMetrics: config.send_metrics,
			});
			removeSignalHandlers();
			resolveDone();
		}

		/** Idempotent Ctrl-C / SIGTERM handler. */
		async function shutdownHandler(): Promise<void> {
			if (isShuttingDown) {
				return;
			}
			isShuttingDown = true;
			if (args.format === "pretty") {
				logger.log("\nStopping tail...");
			}
			await teardownCurrentConnection();
			metrics.sendMetricsEvent("end log stream", {
				sendMetrics: config.send_metrics,
			});
			removeSignalHandlers();
			resolveDone();
		}

		function removeSignalHandlers() {
			process.removeListener("SIGINT", shutdownHandler);
			process.removeListener("SIGTERM", shutdownHandler);
		}

		process.on("SIGINT", shutdownHandler);
		process.on("SIGTERM", shutdownHandler);

		try {
			await connect();
		} catch (e) {
			// Initial connect failed — clean up signal listeners and propagate
			// through the normal error pipeline (preserves existing behaviour
			// for things like "Connection … closed unexpectedly.").
			removeSignalHandlers();
			// Pair the `"begin log stream"` metric sent at handler start with
			// an `"end log stream"` here so sessions that never made it past
			// the initial handshake are balanced in telemetry alongside the
			// `cleanStop` / `shutdownHandler` / give-up exit paths. The old
			// busy-wait-based implementation sent this metric on its
			// `tail.CLOSED` branch; this preserves that behaviour after the
			// switch to an event-based open-wait.
			metrics.sendMetricsEvent("end log stream", {
				sendMetrics: config.send_metrics,
			});
			throw e;
		}

		await done;
	},
});

/**
 * Start pinging the websocket to see if it is still connected.
 *
 * We need to know if the connection to the tail drops.
 * To do this we send a ping message to the backend every few seconds.
 * If we don't get a matching pong message back before the next ping is due
 * then we have probably lost the connection.
 */
function startWebSocketPing(
	tail: WebSocket,
	onDisconnect: () => void
): () => void {
	/** The correlation message to send to tail when pinging. */
	const PING_MESSAGE = Buffer.from("wrangler tail ping");

	let waitingForPong = false;
	let disconnected = false;

	const pingInterval = setInterval(() => {
		if (disconnected) {
			return;
		}
		if (waitingForPong) {
			// We didn't get a pong back quickly enough so assume the connection
			// died. Stop pinging and notify the caller — never throw from here,
			// since this callback is detached from any awaited promise and an
			// uncaught throw would crash the process with a raw stack trace.
			//
			// Use `warn` (not `error`): `onDisconnect()` will normally trigger
			// a reconnect, and the reconnect path also surfaces a user-facing
			// `Reconnecting (attempt N of M)` warning. Logging an error here
			// would read as a hard failure even when recovery succeeds.
			disconnected = true;
			clearInterval(pingInterval);
			logger.warn(
				`Tail connection lost: the Worker did not respond to a keep-alive ping within ${PING_INTERVAL_MS}ms.`
			);
			onDisconnect();
			return;
		}
		waitingForPong = true;
		logger.debug("Tail: Sending ping to tail websocket");
		tail.ping(PING_MESSAGE);
	}, PING_INTERVAL_MS);

	tail.on("pong", (data: Buffer) => {
		if (data.equals(PING_MESSAGE)) {
			logger.debug("Tail: Received pong from tail websocket");
			waitingForPong = false;
		}
	});

	return () => {
		disconnected = true;
		clearInterval(pingInterval);
	};
}
