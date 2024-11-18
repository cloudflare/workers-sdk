import chalk from "chalk";
import { defineAlias, defineCommand, defineNamespace } from "../core";
import { getWranglerSendMetricsFromEnv } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import { readMetricsConfig, updateMetricsPermission } from "./metrics-config";

defineNamespace({
	command: "wrangler telemetry",
	metadata: {
		description: "📈 Configure whether Wrangler collects telemetry",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true,
	},
});

defineAlias({
	command: "wrangler metrics",
	aliasOf: "wrangler telemetry",
});

defineCommand({
	command: "wrangler telemetry disable",
	metadata: {
		description: "Disable Wrangler telemetry collection",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	async handler() {
		updateMetricsPermission(false);
		logTelemetryStatus(false);
		logger.log(
			"Wrangler is no longer collecting telemetry about your usage.\n"
		);
	},
});

defineCommand({
	command: "wrangler telemetry enable",
	metadata: {
		description: "Enable Wrangler telemetry collection",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	async handler() {
		updateMetricsPermission(true);
		logTelemetryStatus(true);
		logger.log(
			"Wrangler is now collecting telemetry about your usage. Thank you for helping make Wrangler better 🧡\n"
		);
	},
});

defineCommand({
	command: "wrangler telemetry status",
	metadata: {
		description: "Check whether Wrangler telemetry collection is enabled",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	async handler(_, { config }) {
		const savedConfig = readMetricsConfig();
		const sendMetricsEnv = getWranglerSendMetricsFromEnv();
		if (config.send_metrics !== undefined || sendMetricsEnv !== undefined) {
			const resolvedPermission =
				sendMetricsEnv !== undefined
					? sendMetricsEnv === "true"
					: config.send_metrics;
			logger.log(
				`Status: ${resolvedPermission ? chalk.green("Enabled") : chalk.red("Disabled")} (set by ${sendMetricsEnv !== undefined ? "environment variable" : "wrangler.toml"})\n`
			);
		} else {
			logTelemetryStatus(savedConfig.permission?.enabled ?? true);
		}
		logger.log(
			"To configure telemetry globally on this machine, you can run `wrangler telemetry disable / enable`.\n" +
				"You can override this for individual projects with the environment variable `WRANGLER_SEND_METRICS=true/false`.\n"
		);
	},
});

const logTelemetryStatus = (enabled: boolean) => {
	logger.log(
		`Status: ${enabled ? chalk.green("Enabled") : chalk.red("Disabled")}\n`
	);
};
