import { logRaw } from "@cloudflare/cli";
import {
	getDeviceId,
	readMetricsConfig,
	writeMetricsConfig,
} from "helpers/metrics-config";


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
