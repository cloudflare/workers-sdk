import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout } from "node:timers/promises";
import { logRaw } from "@cloudflare/cli";
import { CancelError } from "@cloudflare/cli/error";
import {
	getDeviceId,
	readMetricsConfig,
	writeMetricsConfig,
} from "helpers/metrics-config";
import { detectPackageManager } from "helpers/packageManagers";
import * as sparrow from "helpers/sparrow";
import { version as c3Version } from "../package.json";
import type { Event } from "./event";

// A type to extract the prefix of event names sharing the same suffix
type EventPrefix<Suffix extends string> =
	Event["name"] extends `${infer Name} ${Suffix}` ? Name : never;

// A type to get all possible keys of a union type
type KeysOfUnion<Obj> = Obj extends Obj ? keyof Obj : never;

// A type to extract the properties of an event based on the name
type EventProperties<EventName extends Event["name"]> = Extract<
	Event,
	{ name: EventName }
>["properties"];

// A method returns an object containing a new Promise object and two functions to resolve or reject it.
// This can be replaced with `Promise.withResolvers()` when it is available
export function promiseWithResolvers<T>() {
	let resolve: ((value: T) => void) | undefined;
	let reject: ((reason?: unknown) => void) | undefined;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	if (!resolve || !reject) {
		throw new Error("Promise resolvers not set");
	}

	return { resolve, reject, promise };
}

export function getPlatform() {
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

export function createReporter() {
	const events: Array<Promise<void>> = [];
	const als = new AsyncLocalStorage<{
		setEventProperty: (key: string, value: unknown) => void;
	}>();

	const config = readMetricsConfig() ?? {};
	const isFirstUsage = config.c3permission === undefined;
	const isEnabled = isTelemetryEnabled();
	const deviceId = getDeviceId(config);
	const packageManager = detectPackageManager();
	const platform = getPlatform();
	const amplitude_session_id = Date.now();
	const enableLog = process.env.CREATE_CLOUDFLARE_TELEMETRY_DEBUG === "1";

	// The event id is an incrementing counter to distinguish events with the same `user_id` and timestamp from each other.
	// @see https://amplitude.com/docs/apis/analytics/http-v2#event-array-keys
	let amplitude_event_id = 0;

	function sendEvent<EventName extends Event["name"]>(
		name: EventName,
		properties: EventProperties<EventName>,
	): void {
		if (!isEnabled) {
			return;
		}

		const request = sparrow.sendEvent(
			{
				event: name,
				deviceId,
				timestamp: Date.now(),
				properties: {
					amplitude_session_id,
					amplitude_event_id: amplitude_event_id++,
					platform,
					c3Version,
					isFirstUsage,
					packageManager: packageManager.name,
					...properties,
				},
			},
			enableLog,
		);

		// TODO(consider): retry failed requests
		// TODO(consider): add a timeout to avoid the process staying alive for too long

		events.push(request);
	}

	function isTelemetryEnabled() {
		if (process.env.CREATE_CLOUDFLARE_TELEMETRY_DISABLED === "1") {
			return false;
		}

		return sparrow.hasSparrowSourceKey() && getC3Permission(config).enabled;
	}

	async function waitForAllEventsSettled(): Promise<void> {
		await Promise.allSettled(events);
	}

	function createTracker<
		Prefix extends EventPrefix<
			"started" | "cancelled" | "errored" | "completed"
		>,
	>(eventPrefix: Prefix, props: EventProperties<`${Prefix} started`>) {
		let startTime: number | null = null;
		const additionalProperties: Record<string, unknown> = {};

		function submitEvent(name: Event["name"]) {
			if (!startTime) {
				startTime = Date.now();
			} else {
				const ms = Date.now() - startTime;

				additionalProperties["durationMs"] = ms;
				additionalProperties["durationSeconds"] = ms / 1000;
				additionalProperties["durationMinutes"] = ms / 1000 / 60;
			}

			sendEvent(name, {
				...props,
				...additionalProperties,
			});
		}

		return {
			setEventProperty(key: string, value: unknown) {
				additionalProperties[key] = value;
			},
			started() {
				submitEvent(`${eventPrefix} started`);
			},
			completed() {
				submitEvent(`${eventPrefix} completed`);
			},
			cancelled(signal?: NodeJS.Signals) {
				additionalProperties["signal"] = signal;

				submitEvent(`${eventPrefix} cancelled`);
			},
			errored(error: unknown) {
				additionalProperties["error"] = {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				};

				submitEvent(`${eventPrefix} errored`);
			},
		};
	}

	// Collect metrics for an async function
	// This tracks each stages of the async function and sends the corresonding event to sparrow
	async function collectAsyncMetrics<
		Prefix extends EventPrefix<
			"started" | "cancelled" | "errored" | "completed"
		>,
		Result,
	>(options: {
		eventPrefix: Prefix;
		props: EventProperties<`${Prefix} started`>;
		disableTelemetry?: boolean;
		promise: () => Promise<Result>;
	}): Promise<Result> {
		// Create a new promise that will reject when the user interrupts the process
		const cancelDeferred = promiseWithResolvers<never>();
		const cancel = async (signal?: NodeJS.Signals) => {
			// Let subtasks handles the signals first with a short timeout
			await setTimeout(10);

			cancelDeferred.reject(new CancelError(`Operation cancelled`, signal));
		};
		const tracker = !options.disableTelemetry
			? createTracker(options.eventPrefix, options.props)
			: null;

		try {
			tracker?.started();

			// Attach the SIGINT and SIGTERM event listeners to handle cancellation
			process.on("SIGINT", cancel).on("SIGTERM", cancel);

			const result = await Promise.race([
				// The deferred promise will reject when the user interrupts the process
				cancelDeferred.promise,
				als.run(
					{
						// This allows the promise to use the `setEventProperty` helper to
						// update the properties object sent to sparrow
						setEventProperty(key, value) {
							tracker?.setEventProperty(key, value);
						},
					},
					options.promise,
				),
			]);

			tracker?.completed();

			return result;
		} catch (e) {
			if (e instanceof CancelError) {
				tracker?.cancelled(e.signal);
			} else {
				tracker?.errored(e);
			}

			// Rethrow the error so it can be caught by the caller
			throw e;
		} finally {
			// Clean up the event listeners
			process.off("SIGINT", cancel).off("SIGTERM", cancel);
		}
	}

	// To be used within `collectAsyncMetrics` to update the properties object sent to sparrow
	function setEventProperty<Key extends KeysOfUnion<Event["properties"]>>(
		key: Key,
		value: unknown,
	) {
		const store = als.getStore();

		// Throw only on test environment to avoid breaking the CLI
		if (!store && process.env.VITEST) {
			throw new Error(
				"`setEventProperty` must be called within `collectAsyncMetrics`",
			);
		}

		store?.setEventProperty(key, value);
	}

	return {
		sendEvent,
		waitForAllEventsSettled,
		collectAsyncMetrics,
		setEventProperty,
		isEnabled,
	};
}

// A singleton instance of the reporter that can be imported and used across the codebase
export const reporter = createReporter();

export function initializeC3Permission(enabled = true) {
	return {
		enabled,
		date: new Date(),
	};
}

export function getC3Permission(config = readMetricsConfig() ?? {}) {
	if (!config.c3permission) {
		config.c3permission = initializeC3Permission();

		writeMetricsConfig(config);
	}

	return config.c3permission;
}

// To update the c3permission property in the metrics config
export function updateC3Pemission(enabled: boolean) {
	const config = readMetricsConfig();

	if (config.c3permission?.enabled === enabled) {
		// Do nothing if the enabled state is the same
		return;
	}

	config.c3permission = initializeC3Permission(enabled);

	writeMetricsConfig(config);
}

export const runTelemetryCommand = (
	action: "status" | "enable" | "disable",
) => {
	const logTelemetryStatus = (enabled: boolean) => {
		logRaw(`Status: ${enabled ? "Enabled" : "Disabled"}`);
		logRaw("");
	};

	switch (action) {
		case "enable": {
			updateC3Pemission(true);
			logTelemetryStatus(true);
			logRaw(
				"Create-Cloudflare is now collecting telemetry about your usage. Thank you for helping us improve the experience!",
			);
			break;
		}
		case "disable": {
			updateC3Pemission(false);
			logTelemetryStatus(false);
			logRaw("Create-Cloudflare is no longer collecting telemetry");
			break;
		}
		case "status": {
			const telemetry = getC3Permission();

			logTelemetryStatus(telemetry.enabled);
			break;
		}
	}
};
