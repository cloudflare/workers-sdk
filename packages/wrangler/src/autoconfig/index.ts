import {
	AutoConfigDetectionError,
	getDetailsForAutoConfig,
	runAutoConfig,
} from "@cloudflare/autoconfig";
import { sendMetricsEvent } from "../metrics";
import { sanitizeError } from "../metrics/sanitization";
import { getAutoConfigId } from "./telemetry-utils";
import type { AutoConfigWranglerTriggerCommand } from "./telemetry-utils";
import type {
	AutoConfigContext,
	AutoConfigDetails,
	AutoConfigOptions,
	AutoConfigSummary,
} from "@cloudflare/autoconfig";
import type { Config } from "@cloudflare/workers-utils";

export type { AutoConfigWranglerTriggerCommand } from "./telemetry-utils";
export {
	sendAutoConfigProcessEndedMetricsEvent,
	sendAutoConfigProcessStartedMetricsEvent,
} from "./telemetry-utils";

type WranglerAutoConfigAnalysis =
	| {
			configured: true;
			details?: AutoConfigDetails;
	  }
	| {
			configured: false;
			details: AutoConfigDetails;
	  };

/**
 * Detects project details for autoconfig, wrapped with telemetry instrumentation.
 *
 * Sends `autoconfig_detection_started` before calling {@link getDetailsForAutoConfig},
 * then sends `autoconfig_detection_completed` with success or error information.
 * On failure, the error is re-thrown after the telemetry event is sent.
 *
 * @param options.command - The Wrangler command that initiated autoconfig
 * @param options.wranglerConfig - The parsed wrangler configuration (if any)
 * @param options.context - The autoconfig context providing logger, dialogs, etc.
 * @returns The detected project details and whether autoconfiguration is needed
 * @throws Re-throws any error from {@link getDetailsForAutoConfig} after recording telemetry
 */
export async function runAutoConfigDetection({
	command,
	wranglerConfig,
	context,
}: {
	command: NonNullable<AutoConfigWranglerTriggerCommand>;
	wranglerConfig: Config;
	context: AutoConfigContext;
}): Promise<WranglerAutoConfigAnalysis> {
	sendMetricsEvent(
		"autoconfig_detection_started",
		{ autoConfigId: getAutoConfigId(), command },
		{}
	);

	try {
		const projectPath = process.cwd();
		let result: WranglerAutoConfigAnalysis;

		if (
			// If a real Wrangler config has been found the project is already configured for Workers
			wranglerConfig.configPath &&
			// Unless `pages_build_output_dir` is set, since that indicates that the project is a Pages one instead
			!wranglerConfig.pages_build_output_dir
		) {
			context.logger.debug(`Running autoconfig detection in ${projectPath}...`);
			result = {
				configured: true,
			};
		} else {
			const details = await getDetailsForAutoConfig({
				projectPath,
				pagesBuildOutputDir: wranglerConfig.pages_build_output_dir,
				context,
			});

			if (details.framework?.isConfigured(projectPath)) {
				result = {
					configured: true,
					details,
				};
			} else if (!details.outputDir) {
				const errorMessage =
					details.framework?.id === "static" ||
					details.framework?.id === "cloudflare-pages"
						? "Could not detect a directory containing static files (e.g. html, css and js) for the project"
						: "Failed to detect an output directory for the project";

				throw new AutoConfigDetectionError(errorMessage, {
					telemetryMessage: "autoconfig details output directory missing",
					frameworkId: details.framework?.id,
					configured: false,
				});
			} else {
				result = {
					configured: false,
					details,
				};
			}
		}

		sendMetricsEvent(
			"autoconfig_detection_completed",
			{
				autoConfigId: getAutoConfigId(),
				framework: result.details?.framework?.id,
				configured: result.configured,
				success: true,
			},
			{}
		);

		return result;
	} catch (error) {
		sendMetricsEvent(
			"autoconfig_detection_completed",
			{
				autoConfigId: getAutoConfigId(),
				framework:
					error instanceof AutoConfigDetectionError
						? error.frameworkId
						: undefined,
				configured:
					error instanceof AutoConfigDetectionError ? error.configured : false,
				success: false,
				...sanitizeError(error),
			},
			{}
		);
		throw error;
	}
}

/**
 * Runs autoconfig configuration, wrapped with telemetry instrumentation.
 *
 * Sends `autoconfig_configuration_started` before calling {@link runAutoConfig},
 * then sends `autoconfig_configuration_completed` with success or error information.
 * On failure, the error is re-thrown after the telemetry event is sent.
 *
 * @param details - The detection details for the project (from {@link runAutoConfigDetection})
 * @param options - Configuration options passed through to {@link runAutoConfig}
 * @param options.dryRun - Whether autoconfig is running in dry-run mode (used for telemetry)
 * @returns The autoconfig summary from {@link runAutoConfig}
 * @throws Re-throws any error from {@link runAutoConfig} after recording telemetry
 */
export async function runAutoConfigLogic(
	details: AutoConfigDetails,
	options: AutoConfigOptions & { dryRun: boolean }
): Promise<AutoConfigSummary> {
	const frameworkId = details.framework?.id;
	const { dryRun } = options;

	sendMetricsEvent(
		"autoconfig_configuration_started",
		{ autoConfigId: getAutoConfigId(), framework: frameworkId, dryRun },
		{}
	);

	try {
		const summary = await runAutoConfig(details, options);

		sendMetricsEvent(
			"autoconfig_configuration_completed",
			{
				autoConfigId: getAutoConfigId(),
				framework: frameworkId,
				dryRun,
				success: true,
			},
			{}
		);

		return summary;
	} catch (error) {
		sendMetricsEvent(
			"autoconfig_configuration_completed",
			{
				autoConfigId: getAutoConfigId(),
				framework: frameworkId,
				dryRun,
				success: false,
				...sanitizeError(error),
			},
			{}
		);
		throw error;
	}
}
