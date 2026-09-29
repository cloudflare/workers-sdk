import { inspect } from "node:util";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { version as packageVersion } from "../../package.json";
import { logger } from "../logger";
import { proxy } from "../utils/constants";
import { RECONNECT_BACKOFF_MS } from "./reconnect";
import type { TailCLIFilters } from "./filters";
import type {
	Telemetry,
	TelemetryLiveTailParams,
} from "cloudflare/resources/workers/observability/telemetry";

const HEARTBEAT_INTERVAL_MS = 30_000;
const WOBS_READ_SCOPE = "workers_observability:read";
const NORMAL_CLOSURE = 1000;

/**
 * Eligibility lapses server-side without a successful heartbeat while the
 * socket can stay open, so persistent failures would otherwise leave the tail
 * connected but silently receiving nothing.
 */
const MAX_CONSECUTIVE_HEARTBEAT_FAILURES = 3;

type WobsFilters = NonNullable<TelemetryLiveTailParams["filters"]>;
type WobsTelemetry = Pick<Telemetry, "liveTail" | "liveTailHeartbeat">;
type WobsFormat = "json" | "pretty";

type WobsTailOptions = {
	accountId: string;
	scriptName: string;
	filters: TailCLIFilters;
	format: WobsFormat;
	debug: boolean;
	telemetry: WobsTelemetry;
	/** Delays between reconnect attempts; overridable so tests avoid real waits. */
	reconnectBackoffMs?: readonly number[];
};

type WobsSessionOutcome =
	| { kind: "stopped" }
	| { kind: "lost"; error: UserError; wasHealthy: boolean };

type ShutdownController = {
	isStopping(): boolean;
	onStop(listener: () => void): () => void;
	sleep(ms: number): Promise<void>;
	dispose(): void;
};

type WobsTelemetryEvent = {
	timestamp?: number | string;
	source?: unknown;
	$metadata?: {
		level?: string;
		message?: string;
		error?: string;
		spanName?: string;
		duration?: number;
		trigger?: string;
		type?: string;
	};
	$workers?: {
		cpuTimeMs?: number;
		eventType?: string;
		outcome?: string;
		wallTimeMs?: number;
	};
};

/**
 * Ensure the active OAuth login can use the Workers Observability live-tail API.
 *
 * API tokens and temporary accounts carry their own permissions, so only OAuth
 * credentials are checked. OAuth credentials saved without a scope list predate
 * the Workers Observability scope and are treated as missing it.
 *
 * @param options.isOAuth whether the active credential is a stored OAuth token
 * @param options.scopes the scopes recorded for the stored OAuth token, if any
 * @param options.profile the active auth profile, used to suggest how to log in again
 * @throws {UserError} when an OAuth token lacks `workers_observability:read`
 */
export function assertWobsTailAuthScopes({
	isOAuth,
	scopes,
	profile,
}: {
	isOAuth: boolean;
	scopes: readonly string[] | undefined;
	profile: string;
}): void {
	if (!isOAuth || scopes?.includes(WOBS_READ_SCOPE)) {
		return;
	}

	const loginCommand =
		profile === "default"
			? "wrangler login"
			: `wrangler auth create ${profile}`;

	throw new UserError(
		`Your current Wrangler OAuth token does not include the \`${WOBS_READ_SCOPE}\` scope required by the experimental Workers Observability tail. Run \`${loginCommand}\` to re-authenticate, then try again.`,
		{ telemetryMessage: "tail wobs oauth scope missing" }
	);
}

/**
 * Stream a Worker's telemetry through the Workers Observability live-tail
 * service until the user stops it or the connection cannot be re-established.
 *
 * Unexpected disconnects and lapsed heartbeats are retried with the same
 * backoff schedule as the classic tail. Failures creating the first live tail
 * (missing permissions, unknown Worker) are not transient, so they surface
 * immediately instead.
 *
 * @throws {UserError} for unsupported options, or once reconnect attempts are exhausted
 */
export async function runWobsTail({
	accountId,
	scriptName,
	filters,
	format,
	debug,
	telemetry,
	reconnectBackoffMs = RECONNECT_BACKOFF_MS,
}: WobsTailOptions): Promise<void> {
	assertSupportedWobsTailOptions(filters, debug);

	const liveTailParams: TelemetryLiveTailParams = {
		account_id: accountId,
		scriptId: scriptName,
		filterCombination: "and",
		filters: translateCLICommandToWobsFilters(filters),
	};
	const shutdown = createShutdownController(format);
	let attempt = 0;

	async function createLiveTail(): Promise<string> {
		const { wsUrl } = await telemetry.liveTail(liveTailParams);
		return wsUrl;
	}

	/**
	 * Retry live-tail creation with backoff after a session is lost.
	 *
	 * @returns the new WebSocket URL, or `undefined` if the user stopped tailing while waiting
	 */
	async function reestablishLiveTail(
		lostError: UserError
	): Promise<string | undefined> {
		let lastError = lostError;

		while (!shutdown.isStopping()) {
			attempt++;
			if (attempt > reconnectBackoffMs.length) {
				throw new UserError(
					`Unable to reconnect to the Workers Observability tail for ${scriptName} after ${reconnectBackoffMs.length} attempts. ${lastError.message}`,
					{ cause: lastError, telemetryMessage: "tail wobs reconnect failed" }
				);
			}

			const delayMs = reconnectBackoffMs[attempt - 1] ?? 0;
			logger.warn(
				`${lastError.message} Reconnecting (attempt ${attempt} of ${reconnectBackoffMs.length}) in ${delayMs / 1000}s...`
			);
			await shutdown.sleep(delayMs);
			if (shutdown.isStopping()) {
				return undefined;
			}

			try {
				return await createLiveTail();
			} catch (error) {
				lastError = toWobsConnectionError(scriptName, error);
			}
		}

		return undefined;
	}

	try {
		let wsUrl: string | undefined = await createLiveTail();

		while (wsUrl !== undefined && !shutdown.isStopping()) {
			const outcome = await runWobsSession({
				accountId,
				scriptName,
				format,
				telemetry,
				wsUrl,
				shutdown,
			});
			if (outcome.kind === "stopped") {
				return;
			}

			// Only a session that proved healthy resets the budget; otherwise a
			// persistently failing heartbeat would reconnect forever.
			if (outcome.wasHealthy) {
				attempt = 0;
			}
			wsUrl = await reestablishLiveTail(outcome.error);
		}
	} finally {
		shutdown.dispose();
	}
}

/**
 * Translate classic `wrangler tail` filters into Workers Observability
 * live-tail filters. Unsupported options are rejected separately.
 *
 * @param filters the filters parsed from the `wrangler tail` command line
 * @returns the equivalent live-tail filters, combined with `and` by the caller
 */
export function translateCLICommandToWobsFilters(
	filters: TailCLIFilters
): WobsFilters {
	const apiFilters: WobsFilters = [];

	if (filters.status) {
		const outcomes = new Set<string>();
		for (const status of filters.status) {
			if (status === "error") {
				outcomes.add("exception");
				outcomes.add("exceededCpu");
				outcomes.add("exceededMemory");
				outcomes.add("unknown");
			} else {
				outcomes.add(status);
			}
		}

		apiFilters.push({
			key: "$workers.outcome",
			operation: "in",
			type: "string",
			value: Array.from(outcomes).join(","),
		});
	}

	if (filters.method) {
		apiFilters.push({
			kind: "group",
			filterCombination: "or",
			filters: filters.method.map((method) => ({
				key: "$metadata.trigger",
				operation: "starts_with",
				type: "string",
				value: `${method.toUpperCase()} `,
			})),
		});
	}

	if (filters.search) {
		apiFilters.push({
			key: "$metadata.message",
			operation: "includes",
			type: "string",
			value: filters.search,
		});
	}

	if (filters.versionId) {
		apiFilters.push({
			key: "$workers.scriptVersion.id",
			operation: "eq",
			type: "string",
			value: filters.versionId,
		});
	}

	return apiFilters;
}

/**
 * Reject classic `wrangler tail` options that have no Workers Observability
 * equivalent. Pure, so callers can run it before authenticating.
 *
 * @param filters the filters parsed from the `wrangler tail` command line
 * @param debug whether `--debug` was passed
 * @throws {UserError} naming every unsupported option that was passed
 */
export function assertSupportedWobsTailOptions(
	filters: TailCLIFilters,
	debug: boolean
): void {
	const unsupportedOptions = [
		filters.header && "--header",
		filters.samplingRate !== undefined && "--sampling-rate",
		filters.clientIp && "--ip",
		debug && "--debug",
	].filter((option): option is string => typeof option === "string");

	if (unsupportedOptions.length === 0) {
		return;
	}

	throw new UserError(
		`The experimental Workers Observability tail does not yet support ${unsupportedOptions.join(
			", "
		)}. Remove ${unsupportedOptions.length === 1 ? "this option" : "these options"} or use the classic tail.`,
		{ telemetryMessage: "tail wobs unsupported option" }
	);
}

/**
 * Own the SIGINT/SIGTERM handlers for the whole tail rather than per session,
 * so a stop request during reconnect backoff ends the command instead of
 * being lost between sockets.
 */
function createShutdownController(format: WobsFormat): ShutdownController {
	let isStopping = false;
	const stopListeners = new Set<() => void>();

	function stop(): void {
		if (isStopping) {
			return;
		}
		isStopping = true;

		if (format === "pretty") {
			logger.log("\nStopping tail...");
		}

		for (const listener of stopListeners) {
			listener();
		}
	}

	function onStop(listener: () => void): () => void {
		stopListeners.add(listener);
		return () => {
			stopListeners.delete(listener);
		};
	}

	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);

	return {
		isStopping: () => isStopping,
		onStop,
		sleep(ms) {
			return new Promise<void>((resolve) => {
				const timeout = setTimeout(finish, ms);
				const removeStopListener = onStop(finish);

				function finish(): void {
					clearTimeout(timeout);
					removeStopListener();
					resolve();
				}
			});
		},
		dispose() {
			process.removeListener("SIGINT", stop);
			process.removeListener("SIGTERM", stop);
		},
	};
}

/**
 * Run a single live-tail WebSocket session.
 *
 * @returns `stopped` when the user ends the tail or the server closes cleanly;
 *   otherwise `lost` with the reason, so the caller can decide whether to reconnect
 */
function runWobsSession({
	accountId,
	scriptName,
	format,
	telemetry,
	wsUrl,
	shutdown,
}: Pick<
	WobsTailOptions,
	"accountId" | "scriptName" | "format" | "telemetry"
> & {
	wsUrl: string;
	shutdown: ShutdownController;
}): Promise<WobsSessionOutcome> {
	const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
	const socket = new WebSocket(wsUrl, {
		agent,
		headers: { "User-Agent": `wrangler/${packageVersion}` },
	});

	let heartbeat: NodeJS.Timeout | undefined;
	let heartbeatInFlight = false;
	let consecutiveHeartbeatFailures = 0;
	let wasHealthy = false;

	return new Promise<WobsSessionOutcome>((resolve) => {
		let isSettled = false;

		const removeStopListener = shutdown.onStop(() => {
			socket.terminate();
			settle({ kind: "stopped" });
		});

		function settle(outcome: WobsSessionOutcome): void {
			if (isSettled) {
				return;
			}
			isSettled = true;

			if (heartbeat) {
				clearInterval(heartbeat);
			}
			removeStopListener();

			if (outcome.kind === "lost" && socket.readyState !== WebSocket.CLOSED) {
				socket.terminate();
			}
			resolve(outcome);
		}

		function loseSession(error: UserError): void {
			settle({ kind: "lost", error, wasHealthy });
		}

		function onHeartbeatFailure(error: unknown): void {
			consecutiveHeartbeatFailures++;
			logger.debug("WOBS tail: heartbeat failed:", error);

			if (consecutiveHeartbeatFailures < MAX_CONSECUTIVE_HEARTBEAT_FAILURES) {
				return;
			}

			loseSession(
				new UserError(
					`Workers Observability tail for ${scriptName} could not renew its live-tail session after ${MAX_CONSECUTIVE_HEARTBEAT_FAILURES} attempts.`,
					{ cause: error, telemetryMessage: "tail wobs heartbeat failed" }
				)
			);
		}

		function sendHeartbeat(): void {
			if (heartbeatInFlight) {
				return;
			}

			heartbeatInFlight = true;
			void telemetry
				.liveTailHeartbeat({
					account_id: accountId,
					scriptId: scriptName,
				})
				.then(() => {
					consecutiveHeartbeatFailures = 0;
					wasHealthy = true;
				}, onHeartbeatFailure)
				.finally(() => {
					heartbeatInFlight = false;
				});
		}

		socket.on("open", () => {
			if (format === "pretty") {
				logger.log(
					`Connected to ${scriptName} using Workers Observability, waiting for events...`
				);
			}

			sendHeartbeat();
			heartbeat = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
		});

		socket.on("message", (data) => {
			printWobsMessage(data, format);
		});

		socket.on("error", (error) => {
			if (shutdown.isStopping()) {
				settle({ kind: "stopped" });
				return;
			}

			loseSession(toWobsConnectionError(scriptName, error));
		});

		socket.on("close", (code) => {
			if (shutdown.isStopping() || code === NORMAL_CLOSURE) {
				settle({ kind: "stopped" });
				return;
			}

			loseSession(
				new UserError(
					`Workers Observability tail for ${scriptName} closed unexpectedly (code ${code}).`,
					{ telemetryMessage: "tail wobs disconnected" }
				)
			);
		});
	});
}

/**
 * Wrap transport and API failures (ECONNRESET, TLS, proxy, 5xx) as user
 * errors: they are environmental, not Wrangler bugs worth a crash report.
 */
function toWobsConnectionError(scriptName: string, error: unknown): UserError {
	const reason = error instanceof Error ? error.message : String(error);

	return new UserError(
		`Workers Observability tail for ${scriptName} failed: ${reason}.`,
		{ cause: error, telemetryMessage: "tail wobs connection error" }
	);
}

/**
 * Print a single live-tail WebSocket message in the requested format.
 *
 * @param data the raw WebSocket message
 * @param format `json` prints the event verbatim; `pretty` prints a compact line
 */
export function printWobsMessage(
	data: WebSocket.RawData,
	format: WobsFormat
): void {
	let payload: unknown;
	try {
		payload = JSON.parse(data.toString());
	} catch {
		logger.warn(
			"Received a malformed Workers Observability tail event:",
			data.toString()
		);
		return;
	}

	if (format === "json") {
		logger.json(payload);
	} else {
		prettyPrintWobsEvent(payload);
	}
}

function prettyPrintWobsEvent(value: unknown): void {
	if (!isRecord(value)) {
		logger.log(inspect(value));
		return;
	}

	const event = value as WobsTelemetryEvent;
	const metadata = event.$metadata ?? {};
	const workers = event.$workers ?? {};
	const timestamp = formatTimestamp(event.timestamp);
	const prefix = timestamp ? chalk.dim(timestamp) : "";

	if (metadata.type === "cf-worker-event" || workers.outcome) {
		const trigger =
			metadata.trigger ?? workers.eventType ?? "Worker invocation";
		const timing = formatTiming(workers.cpuTimeMs, workers.wallTimeMs);
		logger.log(
			`${prefix} ${chalk.bold(trigger)} - ${prettifyOutcome(workers.outcome)}${timing}`.trim()
		);
		return;
	}

	if (metadata.type === "cf-worker-span" || metadata.spanName) {
		const duration =
			metadata.duration === undefined ? "" : ` (${metadata.duration}ms)`;
		logger.log(
			`${prefix} ${chalk.cyan("span")} ${metadata.spanName ?? "unknown"}${duration}`.trim()
		);
		return;
	}

	const level = metadata.level ?? (metadata.error ? "error" : "log");
	const message =
		metadata.error ?? metadata.message ?? formatSource(event.source);
	logger.log(`${prefix} ${formatLevel(level)} ${message}`.trim());
}

function formatTimestamp(timestamp: number | string | undefined): string {
	if (timestamp === undefined) {
		return "";
	}

	const date = new Date(timestamp);
	return Number.isNaN(date.valueOf()) ? String(timestamp) : date.toISOString();
}

function formatTiming(cpuTimeMs?: number, wallTimeMs?: number): string {
	const timings = [
		cpuTimeMs === undefined ? undefined : `${cpuTimeMs}ms CPU`,
		wallTimeMs === undefined ? undefined : `${wallTimeMs}ms wall`,
	].filter((timing): timing is string => timing !== undefined);

	return timings.length === 0 ? "" : ` (${timings.join(", ")})`;
}

function prettifyOutcome(outcome: string | undefined): string {
	if (!outcome) {
		return chalk.dim("unknown");
	}

	if (outcome === "ok") {
		return chalk.green("ok");
	}

	if (outcome === "canceled") {
		return chalk.yellow("canceled");
	}

	return chalk.red(outcome);
}

function formatLevel(level: string): string {
	switch (level.toLowerCase()) {
		case "error":
			return chalk.red.bold("ERROR");
		case "warn":
			return chalk.yellow.bold("WARN ");
		case "debug":
			return chalk.dim("DEBUG");
		case "info":
			return chalk.blue("INFO ");
		default:
			return chalk.dim("LOG  ");
	}
}

function formatSource(source: unknown): string {
	return typeof source === "string" ? source : inspect(source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
