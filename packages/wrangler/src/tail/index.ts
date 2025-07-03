import { setTimeout } from "node:timers/promises";
import onExit from "signal-exit";
import { configFileName } from "../config";
import { createCommand } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getLegacyScriptName } from "../utils/getLegacyScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import { printWranglerBanner } from "../wrangler-banner";
import { getWorkerForZone } from "../zones";
import {
	createTail,
	jsonPrintLogs,
	prettyPrintLogs,
	translateCLICommandToFilterMessage,
} from "./createTail";
import type { TailCLIFilters } from "./createTail";

export const tailCommand = createCommand({
	metadata: {
		description: "🦚 Start a log tailing session for a Worker",
		status: "stable",
		owner: "Workers: Workers Observability",
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
			!isLegacyEnv(config) ? args.env : undefined
		);

		const scriptDisplayName = `${scriptName}${
			args.env && !isLegacyEnv(config) ? ` (${args.env})` : ""
		}`;

		if (args.format === "pretty") {
			logger.log(
				`Successfully created tail, expires at ${expiration.toLocaleString()}`
			);
		}

		const printLog: (data: MessageEvent) => void =
			args.format === "pretty" ? prettyPrintLogs : jsonPrintLogs;

		tail.addEventListener("message", printLog);

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

		tail.addEventListener("close", exit);
		onExit(exit);

		async function exit() {
			tail.close();
			await deleteTail();
			metrics.sendMetricsEvent("end log stream", {
				sendMetrics: config.send_metrics,
			});
		}
	},
});
