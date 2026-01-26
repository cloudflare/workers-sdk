import { configFormat } from "@cloudflare/workers-utils";
import { detectAgenticEnvironment } from "am-i-vibing";
import chalk from "chalk";
import { fetch } from "undici";
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
import {
	ALLOW,
	getAllowedArgs,
	sanitizeArgKeys,
	sanitizeArgValues,
} from "./sanitization";
import type { MetricsConfigOptions } from "./metrics-config";
import type { AllowList } from "./sanitization";
import type { CommonEventProperties, Events } from "./types";

const SPARROW_URL = "https://sparrow.cloudflare.com";

// Module-level Set to track all pending requests across all dispatchers.
// Promises are automatically removed from this Set once they settle.
const pendingRequests = new Set<Promise<void>>();

/**
 * Returns a promise that resolves when all pending metrics requests have completed.
 *
 * The returned promise should be awaited before the process exits to ensure we don't drop any metrics.
 */
export function allMetricsDispatchesCompleted(): Promise<void> {
	return Promise.allSettled(pendingRequests).then(() => {});
}

/**
 * A list of all the command args that can be included in the event.
 *
 * The "*" command applies to all sub commands at this level.
 * Specific commands can override or add to the allow list.
 *
 * Each arg can have one of three values:
 * - an array of strings: only those specific values are allowed
 * - REDACT: the arg value will always be redacted
 * - ALLOW: all values for that arg are allowed
 */
const COMMAND_ARG_ALLOW_LIST: AllowList = {
	// * applies to all sub commands
	"wrangler *": {
		format: ALLOW,
		logLevel: ALLOW,
	},
	"wrangler tail": { status: ALLOW },
	"wrangler types": {
		xIncludeRuntime: [".wrangler/types/runtime.d.ts"],
		path: ["worker-configuration.d.ts"],
	},
};

export function getMetricsDispatcher(options: MetricsConfigOptions) {
	// The SPARROW_SOURCE_KEY will be provided at build time through esbuild's `define` option
	// No events will be sent if the env `SPARROW_SOURCE_KEY` is not provided and the value will be set to an empty string instead.
	const SPARROW_SOURCE_KEY = process.env.SPARROW_SOURCE_KEY ?? "";
	const wranglerVersion = getWranglerVersion();
	const [wranglerMajorVersion, wranglerMinorVersion, wranglerPatchVersion] =
		wranglerVersion.split(".").map((v) => parseInt(v, 10));
	const amplitude_session_id = Date.now();
	let amplitude_event_id = 0;

	// Detect agent environment once when dispatcher is created
	// Pass empty array for processAncestry to skip process tree checks entirely.
	// Process tree traversal uses execSync('ps ...') which is slow and can cause
	// timeouts, especially in CI environments. Environment variable detection
	// is sufficient for identifying most agentic environments.
	let agent: string | null = null;
	try {
		const agentDetection = detectAgenticEnvironment(process.env, []);
		agent = agentDetection.id;
	} catch {
		// Silent failure - agent remains null
	}

	return {
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
					wranglerMajorVersion,
					wranglerMinorVersion,
					wranglerPatchVersion,
					os: getOS(),
					agent,
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
			>
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

				const sanitizedArgs = sanitizeArgKeys(
					properties.args ?? {},
					options.argv
				);
				const sanitizedArgsKeys = Object.keys(sanitizedArgs).sort();
				const commonEventProperties: CommonEventProperties = {
					amplitude_session_id,
					amplitude_event_id: amplitude_event_id++,
					wranglerVersion,
					wranglerMajorVersion,
					wranglerMinorVersion,
					wranglerPatchVersion,
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
					argsUsed: sanitizedArgsKeys,
					argsCombination: sanitizedArgsKeys.join(", "),
					agent,
				};

				// get the args where we don't want to redact their values
				const allowedArgs = getAllowedArgs(
					COMMAND_ARG_ALLOW_LIST,
					properties.command ?? "wrangler"
				);
				properties.args = sanitizeArgValues(sanitizedArgs, allowedArgs);

				dispatch({
					name,
					properties: {
						...commonEventProperties,
						...properties,
					},
				});
			} catch (err) {
				logger.debug("Error sending metrics event", err);
			}
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
			})
			.finally(() => {
				pendingRequests.delete(request);
			});

		pendingRequests.add(request);
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

export type Properties = Record<string, unknown>;
