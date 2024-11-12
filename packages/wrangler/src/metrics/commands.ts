import chalk from "chalk";
import { defineCommand, defineNamespace } from "../core";
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
		if (config.send_metrics !== undefined) {
			const globalPermission = savedConfig.permission?.enabled ?? true;
			const projectPermission = config.send_metrics;
			logger.log(
				`Global status: ${globalPermission ? chalk.green("Enabled") : chalk.red("Disabled")}\n` +
					`Project status: ${projectPermission ? chalk.green("Enabled") : chalk.red("Disabled")}\n`
			);
		} else {
			logTelemetryStatus(savedConfig.permission?.enabled ?? true);
		}
	},
});

const logTelemetryStatus = (enabled: boolean) => {
	logger.log(
		`Status: ${enabled ? chalk.green("Enabled") : chalk.red("Disabled")}\n`
	);
};
