import { configFormat } from "@cloudflare/workers-utils";
import { detectAgenticEnvironment } from "am-i-vibing";
import chalk from "chalk";
import ci from "ci-info";
import { fetch } from "undici";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { sniffUserAgent } from "../package-manager";
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
import type { CommandDefinition } from "../core/types";
import type { MetricsConfigOptions } from "./metrics-config";
import type {
	CommonCommandEventProperties,
	CommonEventProperties,
	Events,
} from "./types";

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

	function getCommonEventProperties(): CommonEventProperties {
		return {
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
			isCI: ci.isCI,
			isPagesCI: ci.CLOUDFLARE_PAGES,
			isWorkersCI: ci.CLOUDFLARE_WORKERS,
			isInteractive: isInteractive(),
			hasAssets: options.hasAssets ?? false,
			agent,
		};
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
					...getCommonEventProperties(),
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
		 * Posts events to telemetry when a command is started, has completed, or has errored.
		 *
		 * @param name The name of the event to send
		 * @param properties The properties specific to this event
		 * @param cmdBehaviour The behavior of the command being executed. Might not been provided for unrecognized commands.
		 */
		sendCommandEvent<EventName extends Events["name"]>(
			name: EventName,
			properties: Omit<
				Extract<Events, { name: EventName }>["properties"],
				keyof CommonCommandEventProperties
			> & { argsUsed: string[] },
			cmdBehaviour?: CommandDefinition["behaviour"]
		): void {
			if (cmdBehaviour?.sendMetrics === false) {
				return;
			}

			try {
				if (cmdBehaviour?.printMetricsBanner === true) {
					// printMetricsBanner can throw
					printMetricsBanner();
				}

				const argsUsed = properties.argsUsed;
				const argsCombination = argsUsed.join(", ");

				const commonCommandEventProperties: CommonCommandEventProperties = {
					...getCommonEventProperties(),
					argsUsed,
					argsCombination,
				};

				dispatch({
					name,
					properties: {
						...commonCommandEventProperties,
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

	/**
	 * Note that this function can throw if writing to the config file fails.
	 */
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
