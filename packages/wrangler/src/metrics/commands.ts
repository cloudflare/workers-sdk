import {
	getWranglerSendMetricsFromEnv,
	isDoNotTrackEnabled,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import {
	createAlias,
	createCommand,
	createNamespace,
} from "../core/create-command";
import { logger } from "../logger";
import { readMetricsConfig, updateMetricsPermission } from "./metrics-config";

export const telemetryNamespace = createNamespace({
	metadata: {
		description: "📈 Configure whether Wrangler collects telemetry",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true,
	},
});

export const metricsAlias = createAlias({
	aliasOf: "wrangler telemetry",
});

export const telemetryDisableCommand = createCommand({
	metadata: {
		description: "Disable Wrangler telemetry collection",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		sendMetrics: false,
		suggestSkillsAfterHandler: true,
	},
	async handler() {
		updateMetricsPermission(false);
		logTelemetryStatus(false);
		logger.log(
			"Wrangler is no longer collecting telemetry about your usage.\n"
		);
	},
});

export const telemetryEnableCommand = createCommand({
	metadata: {
		description: "Enable Wrangler telemetry collection",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		suggestSkillsAfterHandler: true,
	},
	async handler(_, { config }) {
		updateMetricsPermission(true);

		const telemetry = resolveTelemetryStatus(config.send_metrics);
		logTelemetryStatus(telemetry.enabled, telemetry.source);
		if (telemetry.enabled) {
			logger.log(
				"Wrangler is now collecting telemetry about your usage. Thank you for helping make Wrangler better 🧡\n"
			);
		} else {
			logger.log(
				`Telemetry has been enabled in Wrangler's global configuration, but remains disabled because it is overridden by ${telemetry.source}.\n`
			);
		}
	},
});

export const telemetryStatusCommand = createCommand({
	metadata: {
		description: "Check whether Wrangler telemetry collection is enabled",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		suggestSkillsAfterHandler: true,
	},
	async handler(_, { config }) {
		const telemetry = resolveTelemetryStatus(config.send_metrics);
		logTelemetryStatus(telemetry.enabled, telemetry.source);
		logger.log(
			"To configure telemetry globally on this machine, you can run `wrangler telemetry disable / enable`.\n" +
				"You can override this for individual projects with the environment variable `WRANGLER_SEND_METRICS=true/false`.\n" +
				"Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md\n"
		);
	},
});

function resolveTelemetryStatus(sendMetrics: boolean | undefined): {
	enabled: boolean;
	source?: string;
} {
	if (isDoNotTrackEnabled()) {
		return { enabled: false, source: "DO_NOT_TRACK" };
	}

	const sendMetricsEnv = getWranglerSendMetricsFromEnv();
	if (sendMetricsEnv !== undefined) {
		return { enabled: sendMetricsEnv, source: "WRANGLER_SEND_METRICS" };
	}

	if (sendMetrics !== undefined) {
		return { enabled: sendMetrics, source: "wrangler config" };
	}

	const savedConfig = readMetricsConfig();
	return { enabled: savedConfig.permission?.enabled ?? true };
}

function logTelemetryStatus(enabled: boolean, source?: string) {
	const sourceMessage = source === undefined ? "" : ` (set by ${source})`;
	logger.log(
		`Status: ${enabled ? chalk.green("Enabled") : chalk.red("Disabled")}${sourceMessage}\n`
	);
}
