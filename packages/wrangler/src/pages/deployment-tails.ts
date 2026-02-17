import { setTimeout } from "node:timers/promises";
import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	FatalError,
} from "@cloudflare/workers-utils";
import onExit from "signal-exit";
import { fetchResult } from "../cfetch";
import { loadConfig } from "../config";
import { getConfigCache } from "../config-cache";
import { createCommand } from "../core/create-command";
import isInteractive, { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import * as metrics from "../metrics";
import {
	createPagesTail,
	jsonPrintLogs,
	prettyPrintLogs,
} from "../tail/createTail";
import { translateCLICommandToFilterMessage } from "../tail/filters";
import { requireAuth } from "../user";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import { promptSelectProject } from "./prompt-select-project";
import { isUrl } from "./utils";
import type { PagesConfigCache } from "./types";
import type { Deployment } from "@cloudflare/types";

const statusChoices = ["ok", "error", "canceled"] as const;
type StatusChoice = (typeof statusChoices)[number];
const isStatusChoiceList = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data?: any[]
): data is StatusChoice[] =>
	data?.every((d) => statusChoices.includes(d)) ?? false;

export const pagesDeploymentTailCommand = createCommand({
	metadata: {
		description:
			"Start a tailing session for a project's deployment and livestream logs from your Functions",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
		printBanner: (args) =>
			args.format === "pretty" ||
			(args.format === undefined && !isNonInteractiveOrCI()),
	},
	args: {
		deployment: {
			type: "string",
			description:
				"(Optional) ID or URL of the deployment to tail. " +
				"Specify by environment if deployment ID is unknown.",
		},
		"project-name": {
			type: "string",
			description: "The name of the project you would like to tail",
		},
		environment: {
			type: "string",
			choices: ["production", "preview"],
			default: "production",
			description:
				"When not providing a specific deployment ID, " +
				"specifying environment will grab the latest production or " +
				"preview deployment",
		},
		format: {
			type: "string",
			choices: ["json", "pretty"],
			description: "The format of log entries",
		},
		debug: {
			type: "boolean",
			hidden: true,
			default: false,
			description:
				"If a log would have been filtered out, send it through " +
				"anyway alongside the filter which would have blocked it.",
		},
		status: {
			choices: statusChoices,
			description: "Filter by invocation status",
			array: true,
		},
		header: {
			type: "string",
			requiresArg: true,
			description: "Filter by HTTP header",
		},
		method: {
			type: "string",
			requiresArg: true,
			description: "Filter by HTTP method",
			array: true,
		},
		search: {
			type: "string",
			requiresArg: true,
			description: "Filter by a text match in console.log messages",
		},
		"sampling-rate": {
			type: "number",
			description: "Adds a percentage of requests to log sampling rate",
		},
		ip: {
			type: "string",
			requiresArg: true,

			description:
				"Filter by the IP address the request originates from. Use " +
				'"self" to filter for your own IP',
			array: true,
		},
	},
	positionalArgs: ["deployment"],
	async handler({
		deployment,
		projectName,
		environment,
		header,
		ip: clientIp,
		method,
		samplingRate,
		search,
		status,
		format,
		debug,
		...args
	}) {
		if (format === undefined) {
			format = isNonInteractiveOrCI() ? "json" : "pretty";
		}

		if (status && !isStatusChoiceList(status)) {
			throw new FatalError(
				"Invalid value for `--status`. Valid options: " +
					statusChoices.join(", ")
			);
		}

		const config = await loadConfig(args);
		const pagesConfig = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const accountId = await requireAuth(pagesConfig);
		let deploymentId = deployment;

		if (!isInteractive()) {
			if (!deploymentId) {
				throw new FatalError(
					"Must specify a deployment in non-interactive mode.",
					1
				);
			}

			if (!projectName) {
				throw new FatalError(
					"Must specify a project name in non-interactive mode.",
					1
				);
			}
		}

		if (!projectName && isInteractive()) {
			projectName = await promptSelectProject({ accountId });
		}

		if (!deployment && !projectName) {
			throw new FatalError("Must specify a project name or deployment.", 1);
		}

		const deployments: Array<Deployment> = await fetchResult(
			COMPLIANCE_REGION_CONFIG_PUBLIC,
			`/accounts/${accountId}/pages/projects/${projectName}/deployments`,
			{},
			new URLSearchParams({ env: environment })
		);

		const envDeployments = deployments.filter(
			(d) =>
				d.environment === environment &&
				d.latest_stage.name === "deploy" &&
				d.latest_stage.status === "success"
		);

		// Deployment is URL
		if (isUrl(deployment)) {
			const { hostname: deploymentHostname } = new URL(deployment);
			const targetDeployment = envDeployments.find(
				(d) => new URL(d.url).hostname === deploymentHostname
			);

			if (!targetDeployment) {
				throw new FatalError(
					"Could not find deployment match url: " + deployment,
					1
				);
			}

			deploymentId = targetDeployment.id;
		} else if (!deployment) {
			if (envDeployments.length === 0) {
				throw new FatalError(
					"No deployments for environment: " + environment,
					1
				);
			}

			if (format === "pretty") {
				logger.log(
					"No deployment specified. Using latest deployment for",
					environment,
					"environment."
				);
			}

			const latestDeployment = envDeployments
				.map((d) => ({ id: d.id, created_on: new Date(d.created_on) }))
				.sort((a, b) => +b.created_on - +a.created_on)[0];

			deploymentId = latestDeployment.id;
		}

		if (!deploymentId || !projectName) {
			throw new Error("An unknown error occurred.");
		}

		const filters = translateCLICommandToFilterMessage({
			header,
			clientIp,
			method,
			samplingRate,
			search,
			status,
		});

		metrics.sendMetricsEvent("begin pages log stream", {
			sendMetrics: config.send_metrics,
		});

		const { tail, deleteTail } = await createPagesTail({
			accountId,
			projectName,
			deploymentId,
			filters,
			debug,
		});

		const onCloseTail = (() => {
			let didTerminate = false;

			return async () => {
				if (didTerminate) {
					return;
				}

				tail.terminate();
				await deleteTail();
				metrics.sendMetricsEvent("end pages log stream", {
					sendMetrics: config.send_metrics,
				});

				didTerminate = true;
			};
		})();

		onExit(onCloseTail);

		tail.on("message", (data) => {
			if (format === "pretty") {
				prettyPrintLogs(data);
			} else {
				jsonPrintLogs(data);
			}
		});

		tail.on("close", onCloseTail);

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
						`Connection to deployment ${deploymentId} closed unexpectedly.`
					);
			}
		}

		if (format === "pretty") {
			logger.log(
				`Connected to deployment ${deploymentId}, waiting for logs...`
			);
		}
	},
});
