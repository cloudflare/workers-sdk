import { inspect } from "node:util";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { version as packageVersion } from "../../package.json";
import { logger } from "../logger";
import { proxy } from "../utils/constants";
import type { TailCLIFilters } from "./filters";
import type {
	Telemetry,
	TelemetryLiveTailParams,
} from "cloudflare/resources/workers/observability/telemetry";

const HEARTBEAT_INTERVAL_MS = 30_000;
const WOBS_READ_SCOPE = "workers_observability:read";

type WobsFilters = NonNullable<TelemetryLiveTailParams["filters"]>;
type WobsTelemetry = Pick<Telemetry, "liveTail" | "liveTailHeartbeat">;

type WobsTailOptions = {
	accountId: string;
	scriptName: string;
	filters: TailCLIFilters;
	format: "json" | "pretty";
	debug: boolean;
	telemetry: WobsTelemetry;
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

export function assertWobsTailAuthScopes(
	scopes: readonly string[] | undefined,
	profile: string
): void {
	if (!scopes || scopes.includes(WOBS_READ_SCOPE)) {
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

export async function runWobsTail({
	accountId,
	scriptName,
	filters,
	format,
	debug,
	telemetry,
}: WobsTailOptions): Promise<void> {
	assertSupportedOptions(filters, debug);

	const apiFilters = translateCLICommandToWobsFilters(filters);
	const { wsUrl } = await telemetry.liveTail({
		account_id: accountId,
		scriptId: scriptName,
		filterCombination: "and",
		filters: apiFilters,
	});

	const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
	const socket = new WebSocket(wsUrl, {
		agent,
		headers: { "User-Agent": `wrangler/${packageVersion}` },
	});

	await manageWobsTailConnection({
		accountId,
		scriptName,
		format,
		telemetry,
		socket,
	});
}

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

function assertSupportedOptions(filters: TailCLIFilters, debug: boolean): void {
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

async function manageWobsTailConnection({
	accountId,
	scriptName,
	format,
	telemetry,
	socket,
}: Pick<
	WobsTailOptions,
	"accountId" | "scriptName" | "format" | "telemetry"
> & {
	socket: WebSocket;
}): Promise<void> {
	let heartbeat: NodeJS.Timeout | undefined;
	let heartbeatInFlight = false;
	let isStopping = false;

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
			.catch((error: unknown) => {
				logger.debug("WOBS tail: heartbeat failed:", error);
			})
			.finally(() => {
				heartbeatInFlight = false;
			});
	}

	await new Promise<void>((resolve, reject) => {
		let isSettled = false;

		function settle(error?: Error): void {
			if (isSettled) {
				return;
			}
			isSettled = true;
			if (heartbeat) {
				clearInterval(heartbeat);
			}
			process.removeListener("SIGINT", shutdownHandler);
			process.removeListener("SIGTERM", shutdownHandler);

			if (error) {
				if (socket.readyState !== WebSocket.CLOSED) {
					socket.terminate();
				}
				reject(error);
			} else {
				resolve();
			}
		}

		function shutdownHandler(): void {
			if (isStopping) {
				return;
			}
			isStopping = true;

			if (format === "pretty") {
				logger.log("\nStopping tail...");
			}

			socket.terminate();
			settle();
		}

		process.on("SIGINT", shutdownHandler);
		process.on("SIGTERM", shutdownHandler);

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
			settle(isStopping ? undefined : error);
		});

		socket.on("close", (code) => {
			if (isStopping || code === 1000) {
				settle();
				return;
			}

			settle(
				new UserError(
					`Workers Observability tail for ${scriptName} closed unexpectedly (code ${code}).`,
					{ telemetryMessage: "tail wobs disconnected" }
				)
			);
		});
	});
}

export function printWobsMessage(
	data: WebSocket.RawData,
	format: "json" | "pretty"
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
