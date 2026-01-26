import { setTimeout } from "node:timers/promises";
import {
	configFileName,
	createFatalError,
	UserError,
} from "@cloudflare/workers-utils";
import onExit from "signal-exit";
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
					"For Pages, please run `wrangler pages deployment tail` instead."
			);
		}
		metrics.sendMetricsEvent("begin log stream", {
			sendMetrics: config.send_metrics,
		});

		let scriptName;

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
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`wrangler tail <worker-name>\``
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

		const { tail, expiration, deleteTail } = await createTail(
			config,
			accountId,
			scriptName,
			filters,
			args.debug,
			useServiceEnvironments(config) ? args.env : undefined
		);

		const scriptDisplayName = `${scriptName}${
			useServiceEnvironments(config) && args.env ? ` (${args.env})` : ""
		}`;

		if (args.format === "pretty") {
			logger.log(
				`Successfully created tail, expires at ${expiration.toLocaleString()}`
			);
		}

		const printLog: (data: WebSocket.RawData) => void =
			args.format === "pretty" ? prettyPrintLogs : jsonPrintLogs;

		tail.on("message", printLog);

		while (tail.readyState !== tail.OPEN) {
			switch (tail.readyState) {
				case tail.CONNECTING:
					await setTimeout(100);
					break;
				case tail.CLOSING:
					await setTimeout(100);
					break;
				case tail.CLOSED:
					metrics.sendMetricsEvent("end log stream", {
						sendMetrics: config.send_metrics,
					});
					throw new Error(
						`Connection to ${scriptDisplayName} closed unexpectedly.`
					);
			}
		}

		if (args.format === "pretty") {
			logger.log(`Connected to ${scriptDisplayName}, waiting for logs...`);
		}

		const cancelPing = startWebSocketPing();
		tail.on("close", exit);
		onExit(exit);

		async function exit() {
			cancelPing();
			tail.terminate();
			await deleteTail();
			metrics.sendMetricsEvent("end log stream", {
				sendMetrics: config.send_metrics,
			});
		}

		/**
		 * Start pinging the websocket to see if it is still connected.
		 *
		 * We need to know if the connection to the tail drops.
		 * To do this we send a ping message to the backend every few seconds.
		 * If we don't get a matching pong message back before the next ping is due
		 * then we have probably lost the connect.
		 */
		function startWebSocketPing() {
			/** The corelation message to send to tail when pinging. */
			const PING_MESSAGE = Buffer.from("wrangler tail ping");
			/** How long to wait between pings. */
			const PING_INTERVAL = 10000;

			let waitingForPong = false;

			const pingInterval = setInterval(() => {
				if (waitingForPong) {
					// We didn't get a pong back quickly enough so assume the connection died and exit.
					// This approach relies on the fact that throwing an error inside a `setInterval()` callback
					// causes the process to exit.
					// This is a bit nasty but otherwise we have to make wholesale changes to how the `tail` command
					// works, since currently all the tests assume that `runWrangler()` will return immediately.
					throw createFatalError(
						"Tail disconnected, exiting.",
						args.format === "json",
						1,
						{ telemetryMessage: true }
					);
				}
				waitingForPong = true;
				tail.ping(PING_MESSAGE);
			}, PING_INTERVAL);

			tail.on("pong", (data) => {
				if (data.equals(PING_MESSAGE)) {
					waitingForPong = false;
				}
			});

			return () => clearInterval(pingInterval);
		}
	},
});
