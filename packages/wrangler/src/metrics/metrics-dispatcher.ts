import { fetch } from "undici";
import whichPmRuns from "which-pm-runs";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { getMetricsConfig, readMetricsConfig } from "./metrics-config";
import type { MetricsConfigOptions } from "./metrics-config";
import type { CommonEventProperties, Events } from "./send-event";

// The SPARROW_SOURCE_KEY is provided at esbuild time as a `define` for production and beta
// releases. Otherwise it is left undefined, which automatically disables metrics requests.
declare const SPARROW_SOURCE_KEY: string;
const SPARROW_URL = "https://sparrow.cloudflare.com";

function getPlatform() {
	const platform = process.platform;

	switch (platform) {
		case "win32":
			return "Windows";
		case "darwin":
			return "Mac OS";
		case "linux":
			return "Linux";
		default:
			return `Others: ${platform}`;
	}
}

export function getMetricsDispatcher(options: MetricsConfigOptions) {
	const platform = getPlatform();
	const packageManager = whichPmRuns()?.name;
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
			await dispatch({ type: "event", name, properties });
		},

		/**
		 * Dispatch a user profile information to the analytics target.
		 *
		 * This call can be used to inform the analytics target of relevant properties associated
		 * with the current user.
		 */
		async identify(properties: Properties): Promise<void> {
			await dispatch({ type: "identify", name: "identify", properties });
		},
		async sendNewEvent<EventName extends Events["name"]>(
			name: EventName,
			properties: Omit<
				Extract<Events, { name: EventName }>["properties"],
				keyof CommonEventProperties
			>
		): Promise<void> {
			await dispatch({ type: "event", name, properties });
		},
	};

	async function dispatch(event: {
		type: "identify" | "event";
		name: string;
		properties: Properties;
	}): Promise<void> {
		const metricsConfig = getMetricsConfig(options);

		const commonEventProperties: CommonEventProperties = {
			amplitude_session_id,
			amplitude_event_id: amplitude_event_id++,
			wranglerVersion,
			platform,
			packageManager,
			isFirstUsage,
		};
		const body = {
			deviceId: metricsConfig.deviceId,
			event: event.name,
			timestamp: Date.now(),
			properties: {
				...commonEventProperties,
				...event.properties,
			},
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
				"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events.",
				event
			);
			return;
		}

		logger.debug(`Metrics dispatcher: Posting data ${JSON.stringify(body)}`);

		// Do not await this fetch call.
		// Just fire-and-forget, otherwise we might slow down the rest of Wrangler.
		fetch(`${SPARROW_URL}/api/v1/${event.type}`, {
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
