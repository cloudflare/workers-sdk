import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getWranglerSendMetricsFromEnv } from "../environment-variables/misc-variables";
import { getGlobalWranglerConfigPath } from "../global-wrangler-config-path";
import { logger } from "../logger";

/**
 * The date that the metrics being gathered was last updated in a way that would require
 * the user to give their permission again.
 *
 * When reading from a config file, we check the recorded date in the config file against
 * this one here. We ignore the permissions set in the the file if the recorded date is older.
 * This allows us to prompt the user to re-opt-in when we make substantive changes to our metrics
 * gathering.
 */
export const CURRENT_METRICS_DATE = new Date(2022, 6, 4);

export interface MetricsConfigOptions {
	/**
	 * Defines whether to send metrics to Cloudflare:
	 * If defined, then use this value for whether the dispatch is enabled.
	 * Otherwise, infer the enabled value from the user configuration.
	 */
	sendMetrics?: boolean;
}

/**
 * The information needed to set up the MetricsDispatcher.
 */
export interface MetricsConfig {
	/** True if usage tracking is enabled. */
	enabled: boolean;
	/** A UID that identifies this user and machine pair for Wrangler. */
	deviceId: string;
}

/**
 * Get hold of the permissions and device-id for metrics dispatch.
 *
 * The device-id is just a unique identifier sent along with events to help
 * to collate metrics. Once generated, this id is cached in the metrics config file.
 *
 * The permissions define whether we can send metrics or not. They can come from a variety of places:
 * - the `send_metrics` setting in `wrangler.toml`
 * - a cached response from the current user
 * - prompting the user to opt-in to metrics
 *
 * If the user was prompted to opt-in, then their response is cached in the metrics config file.
 *
 * If the current process is not interactive then we will cannot prompt the user and just assume
 * we cannot send metrics if there is no cached or project-level preference available.
 */
export function getMetricsConfig({
	sendMetrics,
}: MetricsConfigOptions): MetricsConfig {
	const config = readMetricsConfig();
	const deviceId = getDeviceId(config);

	// If the WRANGLER_SEND_METRICS environment variable has been set use that
	// and ignore everything else.
	const sendMetricsEnv = getWranglerSendMetricsFromEnv();
	if (sendMetricsEnv !== undefined) {
		return {
			enabled: sendMetricsEnv.toLowerCase() === "true",
			deviceId,
		};
	}

	// If the project is explicitly set the `send_metrics` options in `wrangler.toml`
	// then use that and ignore any user preference.
	if (sendMetrics !== undefined) {
		return { enabled: sendMetrics, deviceId };
	}

	// Get the user preference from the metrics config.
	const permission = config.permission;
	if (permission !== undefined) {
		if (new Date(permission.date) >= CURRENT_METRICS_DATE) {
			return { enabled: permission.enabled, deviceId };
		} else if (permission.enabled) {
			logger.log(
				"Usage metrics tracking has changed since you last granted permission."
			);
		}
	}

	// Otherwise, default to true
	writeMetricsConfig({
		...config,
		permission: {
			enabled: true,
			date: new Date(),
		},
		deviceId,
	});
	return { enabled: true, deviceId };
}

/**
 * Stringify and write the given info to the metrics config file.
 */
export function writeMetricsConfig(config: MetricsConfigFile) {
	mkdirSync(path.dirname(getMetricsConfigPath()), { recursive: true });
	writeFileSync(
		getMetricsConfigPath(),
		JSON.stringify(
			config,
			(_key, value) => (value instanceof Date ? value.toISOString() : value),
			"\t"
		)
	);
}

/**
 * Read and parse the metrics config file.
 */
export function readMetricsConfig(): MetricsConfigFile {
	try {
		const config = readFileSync(getMetricsConfigPath(), "utf8");
		return JSON.parse(config, (key, value) =>
			key === "date" ? new Date(value) : value
		);
	} catch {
		return {};
	}
}

export function updateMetricsPermission(enabled: boolean) {
	const config = readMetricsConfig();
	config.permission = {
		enabled,
		date: new Date(),
	};
	writeMetricsConfig(config);
}

/**
 * Get the path to the metrics config file.
 */
function getMetricsConfigPath(): string {
	return path.resolve(getGlobalWranglerConfigPath(), "metrics.json");
}

/**
 * The format of the metrics config file.
 */
export interface MetricsConfigFile {
	permission?: {
		/** True if Wrangler should send metrics to Cloudflare. */
		enabled: boolean;
		/** The date that this permission was set. */
		date: Date;
		/** Version number the banner was last shown - only show on version update */
		bannerLastShown?: string;
	};
	c3permission?: {
		/** True if c3 should send metrics to Cloudflare. */
		enabled: boolean;
		/** The date that this permission was set. */
		date: Date;
	};
	/** A unique UUID that identifies this device for metrics purposes. */
	deviceId?: string;
}

/**
 * Returns an ID that uniquely identifies Wrangler on this device to help collate events.
 *
 * Once created this ID is stored in the metrics config file.
 */
function getDeviceId(config: MetricsConfigFile) {
	// Get or create the deviceId.
	const deviceId = config.deviceId ?? randomUUID();
	if (config.deviceId === undefined) {
		// We had to create a new deviceID so store it now.
		writeMetricsConfig({ ...config, deviceId });
	}
	return deviceId;
}
