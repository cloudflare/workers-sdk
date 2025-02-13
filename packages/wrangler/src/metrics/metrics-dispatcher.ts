import chalk from "chalk";
import { fetch } from "undici";
import { configFormat } from "../config";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { sniffUserAgent } from "../package-manager";
import { CI, isPagesCI, isWorkersCI } from "./../is-ci";
import {
	getNodeVersion,
	getOS,
	getOSVersion,
	getPlatform,
	getWranglerVersion,
} from "./helpers";
import {
	getMetricsConfig,
	readMetricsConfig,
	writeMetricsConfig,
} from "./metrics-config";
import type { MetricsConfigOptions } from "./metrics-config";
import type { CommonEventProperties, Events } from "./types";

const SPARROW_URL = "https://sparrow.cloudflare.com";
type AllowedValues = Record<string, string[] | "*">;
export type AllowList = Record<string, AllowedValues> & { "*": AllowedValues };
export type Properties = Record<string, unknown>;

export function getMetricsDispatcher(options: MetricsConfigOptions) {
	// The SPARROW_SOURCE_KEY will be provided at build time through esbuild's `define` option
	// No events will be sent if the env `SPARROW_SOURCE_KEY` is not provided and the value will be set to an empty string instead.
	const SPARROW_SOURCE_KEY = process.env.SPARROW_SOURCE_KEY ?? "";
	const requests: Array<Promise<void>> = [];
	const wranglerVersion = getWranglerVersion();
	const amplitude_session_id = Date.now();
	let amplitude_event_id = 0;

	/** We redact strings in arg values, unless they are named here */
	const allowList: AllowList = {
		"*": { format: "*", logLevel: "*" }, // applies to all commands
		"wrangler tail": { status: "*" },
		"wrangler types": {
			xIncludeRuntime: [".wrangler/types/runtime.d.ts"],
			path: ["worker-configuration.d.ts"],
			envInterface: ["Env"],
		},
	};

	return {
		// TODO: merge two sendEvent functions once all commands use defineCommand and get a global dispatcher
		/**
		 * This doesn't have a session id and is not tied to the command events.
		 *
		 * The event should follow these conventions
		 *  - name is of the form `[action] [object]` (lower case)
		 *  - additional properties are camelCased
		 */
		sendAdhocEvent(name: string, properties: Properties = {}) {
			dispatch({
				name,
				properties: {
					category: "Workers",
					wranglerVersion,
					os: getOS(),
					...properties,
				},
			});
		},

		/**
		 * Dispatches `wrangler command started / completed / errored` events
		 *
		 * This happens on every command execution. When all commands use defineCommand,
		 * we should use that to provide the dispatcher on all handlers, and change all
		 * `sendEvent` calls to use this method.
		 */
		sendCommandEvent<EventName extends Events["name"]>(
			name: EventName,
			properties: Omit<
				Extract<Events, { name: EventName }>["properties"],
				keyof CommonEventProperties
			>,
			argv?: string[]
		) {
			try {
				if (properties.command?.startsWith("wrangler login")) {
					properties.command = "wrangler login";
				}
				if (
					properties.command === "wrangler telemetry disable" ||
					properties.command === "wrangler metrics disable"
				) {
					return;
				}
				if (
					properties.command === "wrangler deploy" ||
					properties.command === "wrangler dev" ||
					// for testing purposes
					properties.command === "wrangler docs"
				) {
					printMetricsBanner();
				}
				const processedArgs = processArgsAndValues(
					properties.args ?? {},
					allowList,
					properties.command ?? ""
				);
				const argsUsed = sanitiseUserInput(processedArgs, argv ?? []);
				const argsCombination = argsUsed.sort().join(", ");
				const commonEventProperties: CommonEventProperties = {
					amplitude_session_id,
					amplitude_event_id: amplitude_event_id++,
					wranglerVersion,
					osPlatform: getPlatform(),
					osVersion: getOSVersion(),
					nodeVersion: getNodeVersion(),
					packageManager: sniffUserAgent(),
					isFirstUsage: readMetricsConfig().permission === undefined,
					configFileType: configFormat(options.configPath),
					isCI: CI.isCI(),
					isPagesCI: isPagesCI(),
					isWorkersCI: isWorkersCI(),
					isInteractive: isInteractive(),
					hasAssets: options.hasAssets ?? false,
					argsUsed,
					argsCombination,
				};
				dispatch({
					name,
					properties: {
						...commonEventProperties,
						...properties,
						args: processedArgs,
					},
				});
			} catch (err) {
				logger.debug("Error sending metrics event", err);
			}
		},

		get requests() {
			return requests;
		},
	};

	function dispatch(event: { name: string; properties: Properties }) {
		const metricsConfig = getMetricsConfig(options);
		const body = {
			deviceId: metricsConfig.deviceId,
			event: event.name,
			timestamp: Date.now(),
			properties: event.properties,
		};

		if (!metricsConfig.enabled) {
			logger.debug(
				`Metrics dispatcher: Dispatching disabled - would have sent ${JSON.stringify(
					body
				)}.`
			);
			return;
		}

		if (!SPARROW_SOURCE_KEY) {
			logger.debug(
				"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events",
				JSON.stringify(body)
			);
			return;
		}

		logger.debug(`Metrics dispatcher: Posting data ${JSON.stringify(body)}`);

		// Don't await fetch but make sure requests are resolved (with a timeout)
		// before exiting Wrangler
		const request = fetch(`${SPARROW_URL}/api/v1/event`, {
			method: "POST",
			headers: {
				Accept: "*/*",
				"Content-Type": "application/json",
				"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
			},
			mode: "cors",
			keepalive: true,
			body: JSON.stringify(body),
		})
			.then((res) => {
				if (!res.ok) {
					logger.debug(
						"Metrics dispatcher: Failed to send request:",
						res.statusText
					);
				}
			})
			.catch((e) => {
				logger.debug(
					"Metrics dispatcher: Failed to send request:",
					(e as Error).message
				);
			});

		requests.push(request);
	}

	function printMetricsBanner() {
		const metricsConfig = readMetricsConfig();
		if (
			metricsConfig.permission?.enabled &&
			metricsConfig.permission?.bannerLastShown !== wranglerVersion
		) {
			logger.log(
				chalk.gray(
					`\nCloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md`
				)
			);
			metricsConfig.permission.bannerLastShown = wranglerVersion;
			writeMetricsConfig(metricsConfig);
		}
	}
}

const exclude = new Set(["$0", "_"]);

export const processArgsAndValues = (
	args: Record<string, unknown>,
	allowList: AllowList,
	command: string
) => {
	const processed: Record<string, unknown> = {};
	const seenArgs = new Set<string>();
	for (let [arg, value] of Object.entries(args)) {
		arg = normalise(arg);
		if (exclude.has(arg) || seenArgs.has(arg)) {
			continue;
		}
		seenArgs.add(arg);
		// hardcoding because the default isn't set by yargs
		if (arg === "xIncludeRuntime" && value === "") {
			value = ".wrangler/types/runtime.d.ts";
		}
		const commandSpecificAllowList = {
			...(allowList[command] ?? []),
			...allowList["*"],
		};
		const allowedValues = commandSpecificAllowList[arg] ?? [];
		processed[arg] = redactArgValues(value, allowedValues);
	}
	return processed;
};

const normalise = (arg: string) => {
	const stripFlag = arg.replace(/^--?/, "");
	const normaliseExperimental = stripFlag.replace("experimental", "x");
	const camel = normaliseExperimental.replace(/-./g, (x) => x[1].toUpperCase());
	return camel;
};

const redactArgValues = (
	value: unknown,
	allowedValues: string[] | "*"
): unknown => {
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		allowedValues === "*" ||
		(typeof value === "string" && allowedValues.includes(value))
	) {
		return value;
	} else if (
		// redact if its a string, unless the value is in the allow list
		typeof value === "string"
	) {
		return "<REDACTED>";
	} else if (Array.isArray(value)) {
		return value.map((v) => redactArgValues(v, allowedValues));
	}
	return "<REDACTED_UNK>"; // shouldn't get here
};

/**
 * We use argv to get the user-provided args only. However, argv is args AND
 * values, so we cross-reference with argsWithValues to make sure only args are sent.
 */
const sanitiseUserInput = (
	// processed already
	argsWithValues: Record<string, unknown>,
	argv: string[]
) => {
	const result: string[] = [];
	const normalisedArgv = argv.map((arg) => normalise(arg)) ?? [];
	for (const arg of Object.keys(argsWithValues)) {
		if (
			normalisedArgv.some((a) => a.includes(arg)) &&
			argsWithValues[arg] !== false
		) {
			result.push(arg);
		}
	}
	return result;
};
