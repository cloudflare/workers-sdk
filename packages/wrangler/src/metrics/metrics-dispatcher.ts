import chalk from "chalk";
import { fetch } from "undici";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { CI } from "./../is-ci";
import {
	getOS,
	getPackageManager,
	getPlatform,
	getWranglerVersion,
} from "./helpers";
import {
	getMetricsConfig,
	readMetricsConfig,
	writeMetricsConfig,
} from "./metrics-config";
import type { MetricsConfigOptions } from "./metrics-config";
import type { CommonEventProperties, Events } from "./send-event";

const SPARROW_URL = "https://sparrow.cloudflare.com";

export function getMetricsDispatcher(options: MetricsConfigOptions) {
	// The SPARROW_SOURCE_KEY will be provided at build time through esbuild's `define` option
	// No events will be sent if the env `SPARROW_SOURCE_KEY` is not provided and the value will be set to an empty string instead.
	const SPARROW_SOURCE_KEY = process.env.SPARROW_SOURCE_KEY ?? "";
	const requests: Array<Promise<void>> = [];
	const wranglerVersion = getWranglerVersion();
	const platform = getPlatform();
	const packageManager = getPackageManager();
	const isFirstUsage = readMetricsConfig().permission === undefined;
	const isCI = CI.isCI();
	const isNonInteractive = !isInteractive();
	const amplitude_session_id = Date.now();
	let amplitude_event_id = 0;

	return {
		/**
		 * Dispatch a event to the analytics target.
		 *
		 * The event should follow these conventions
		 *  - name is of the form `[action] [object]` (lower case)
		 *  - additional properties are camelCased
		 */
		async sendEvent(name: string, properties: Properties = {}): Promise<void> {
			await dispatch({
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
		 * This happens on every command execution, and will (hopefully) replace sendEvent soon.
		 * However to prevent disruption, we're adding under `sendNewEvent` for now.
		 */
		async sendNewEvent<EventName extends Events["name"]>(
			name: EventName,
			properties: Omit<
				Extract<Events, { name: EventName }>["properties"],
				keyof CommonEventProperties
			>
		): Promise<void> {
			if (
				properties.command === "wrangler telemetry disable" ||
				properties.command === "wrangler metrics disable"
			) {
				return;
			}
			printMetricsBanner();
			const argsUsed = normaliseArgs(Object.keys(properties.args ?? []));
			const argsCombination = argsUsed.sort().join(", ");
			const commonEventProperties: CommonEventProperties = {
				amplitude_session_id,
				amplitude_event_id: amplitude_event_id++,
				wranglerVersion,
				platform,
				packageManager,
				isFirstUsage,
				isCI,
				isNonInteractive,
				argsUsed,
				argsCombination,
			};

			await dispatch({
				name,
				properties: {
					...commonEventProperties,
					...properties,
				},
			});
		},

		get requests() {
			return requests;
		},
	};

	async function dispatch(event: {
		name: string;
		properties: Properties;
	}): Promise<void> {
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

		// Do not await this fetch call.
		// Just fire-and-forget, otherwise we might slow down the rest of Wrangler.
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
			.then(() => {})
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
					`\nCloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/telemetry.md`
				)
			);
			metricsConfig.permission.bannerLastShown = wranglerVersion;
			writeMetricsConfig(metricsConfig);
		}
	}
}

export type Properties = Record<string, unknown>;

/** just some pretty naive cleaning so we don't send "experimental-versions", "experimentalVersions", "x-versions" and "xVersions" etc. */
const normaliseArgs = (args: string[]) => {
	const exclude = new Set(["$0", "_"]);
	const result: string[] = [];
	for (const arg of args) {
		if (exclude.has(arg)) {
			continue;
		}
		const normalisedArg = arg
			.replace("experimental", "x")
			.replaceAll("-", "")
			.toLowerCase();
		if (result.includes(normalisedArg)) {
			continue;
		}
		result.push(normalisedArg);
	}
	return result;
};
