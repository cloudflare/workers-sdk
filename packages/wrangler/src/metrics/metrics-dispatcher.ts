import { fetch } from "undici";
import { logger } from "../logger";
import {
	getOS,
	getPackageManager,
	getPlatform,
	getWranglerVersion,
} from "./helpers";
import { getMetricsConfig, readMetricsConfig } from "./metrics-config";
import type { MetricsConfigOptions } from "./metrics-config";
import type { CommonEventProperties, Events } from "./send-event";

const SPARROW_URL = "https://sparrow.cloudflare.com";

export function getMetricsDispatcher(options: MetricsConfigOptions) {
	// The SPARROW_SOURCE_KEY will be provided at build time through esbuild's `define` option
	// No events will be sent if the env `SPARROW_SOURCE_KEY` is not provided and the value will be set to an empty string instead.
	const SPARROW_SOURCE_KEY = process.env.SPARROW_SOURCE_KEY ?? "";
	const wranglerVersion = getWranglerVersion();
	const platform = getPlatform();
	const packageManager = getPackageManager();
	const isFirstUsage = readMetricsConfig().permission === undefined;
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

		async sendNewEvent<EventName extends Events["name"]>(
			name: EventName,
			properties: Omit<
				Extract<Events, { name: EventName }>["properties"],
				keyof CommonEventProperties
			>
		): Promise<void> {
			const commonEventProperties: CommonEventProperties = {
				amplitude_session_id,
				amplitude_event_id: amplitude_event_id++,
				wranglerVersion,
				platform,
				packageManager,
				isFirstUsage,
			};

			await dispatch({
				name,
				properties: {
					...commonEventProperties,
					properties,
				},
			});
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
		fetch(`${SPARROW_URL}/api/v1/event`, {
			method: "POST",
			headers: {
				Accept: "*/*",
				"Content-Type": "application/json",
				"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
			},
			mode: "cors",
			keepalive: true,
			body: JSON.stringify(body),
		}).catch((e) => {
			logger.debug(
				"Metrics dispatcher: Failed to send request:",
				(e as Error).message
			);
		});
	}
}

export type Properties = Record<string, unknown>;
