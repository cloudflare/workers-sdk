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
	DeployIntent,
} from "@cloudflare/autoconfig";
import type { Config } from "@cloudflare/workers-utils";

export type { AutoConfigWranglerTriggerCommand } from "./telemetry-utils";
export {
	sendAutoConfigProcessEndedMetricsEvent,
	sendAutoConfigProcessStartedMetricsEvent,
} from "./telemetry-utils";

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
 * @returns The detected project details from {@link getDetailsForAutoConfig}
 * @throws Re-throws any error from {@link getDetailsForAutoConfig} after recording telemetry
 */
export async function runAutoConfigDetection({
	command,
	wranglerConfig,
	context,
	deployIntent,
}: {
	command: NonNullable<AutoConfigWranglerTriggerCommand>;
	wranglerConfig: Config;
	context: AutoConfigContext;
	deployIntent?: DeployIntent;
}): Promise<AutoConfigDetails> {
	sendMetricsEvent(
		"autoconfig_detection_started",
		{
			autoConfigId: getAutoConfigId(),
			command,
			deployTrigger: deployIntent?.trigger,
			targetKind: deployIntent?.targetKind,
			currentDeployInterpretation: deployIntent?.currentDeployInterpretation,
			sourceCategory: deployIntent?.sourceCategory,
		},
		{}
	);

	try {
		const details = await getDetailsForAutoConfig({
			wranglerConfig,
			context,
			deployIntent,
		});

		sendMetricsEvent(
			"autoconfig_detection_completed",
			{
				autoConfigId: getAutoConfigId(),
				framework: details.framework?.id,
				projectKind: details.projectKind,
				adapterId: details.adapterId,
				confidence: details.confidence,
				sourceCategory: details.sourceCategory,
				configured: details.configured,
				success: true,
			},
			{}
		);

		return details;
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
	const adapterId = details.adapterId;
	const projectKind = details.projectKind;
	const { dryRun } = options;

	sendMetricsEvent(
		"autoconfig_configuration_started",
		{
			autoConfigId: getAutoConfigId(),
			framework: frameworkId,
			adapterId,
			projectKind,
			dryRun,
		},
		{}
	);

	try {
		const summary = await runAutoConfig(details, options);

		sendMetricsEvent(
			"autoconfig_configuration_completed",
			{
				autoConfigId: getAutoConfigId(),
				framework: frameworkId,
				adapterId,
				projectKind,
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
				adapterId,
				projectKind,
				dryRun,
				success: false,
				...sanitizeError(error),
			},
			{}
		);
		throw error;
	}
}
