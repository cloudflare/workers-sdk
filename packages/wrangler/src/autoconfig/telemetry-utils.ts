import isCI from "is-ci";
import { sendMetricsEvent } from "../metrics";
import { sanitizeError } from "../metrics/sanitization";

/**
 * The Wrangler command that triggered the autoconfig flow.
 * Can be `"wrangler setup"`, `"wrangler deploy"`, or `undefined` if the programmatic API is used.
 */
export type AutoConfigWranglerTriggerCommand =
	| "wrangler setup"
	| "wrangler deploy"
	| undefined;

/**
 * Internal state for tracking autoconfig telemetry across a single session.
 */
type AutoConfigLocalState = {
	/** The command that triggered the autoconfig flow */
	triggerCommand: AutoConfigWranglerTriggerCommand;
	/** A unique identifier for this autoconfig session */
	autoConfigId: string;
};

/**
 * Module-level state that persists for the duration of the autoconfig process.
 */
const autoConfigLocalState: Partial<AutoConfigLocalState> = {};

/**
 * Returns the Wrangler command that triggered the autoconfig flow.
 *
 * @returns The trigger command, or `undefined` if not set (if the programmatic API was used)
 */
export function getAutoConfigTriggerCommand(): AutoConfigWranglerTriggerCommand {
	return autoConfigLocalState.triggerCommand;
}

/**
 * Returns the unique identifier for the current autoconfig session.
 * This ID is used to correlate all telemetry events within a single autoconfig process.
 *
 * @returns A unique string identifying the current autoconfig session or `undefined` if not set (if the programmatic API was used)
 */
export function getAutoConfigId(): string | undefined {
	return autoConfigLocalState.autoConfigId;
}

/**
 * Sends a telemetry event indicating the autoconfig process has started.
 * This also initializes the local state for autoconfig.
 *
 * This should be called at the beginning of the autoconfig flow, before any
 * detection or configuration occurs.
 *
 * @param options.command The Wrangler command that initiated the autoconfig process
 * @param options.dryRun Whether the command triggering autoconfig was run in dry-run mode
 */
export function sendAutoConfigProcessStartedMetricsEvent({
	command,
	dryRun,
}: {
	command: NonNullable<AutoConfigWranglerTriggerCommand>;
	dryRun: boolean;
}): void {
	autoConfigLocalState.triggerCommand = command;
	autoConfigLocalState.autoConfigId = crypto.randomUUID();

	sendMetricsEvent(
		"autoconfig_process_started",
		{
			autoConfigId: getAutoConfigId(),
			isCI,
			command,
			dryRun,
		},
		{}
	);
}

/**
 * Sends a telemetry event indicating the autoconfig process has ended.
 * This should be called at the end of the autoconfig flow, whether it
 * succeeded or failed.
 *
 * @param options.success Whether the autoconfig process completed successfully
 * @param options.error An error message if the process failed
 * @param options.command The Wrangler command that initiated the autoconfig process
 * @param options.dryRun Whether the command triggering autoconfig was run in dry-run mode
 *
 */
export function sendAutoConfigProcessEndedMetricsEvent({
	success,
	error,
	command,
	dryRun,
}: {
	success: boolean;
	error?: unknown | undefined;
	command: NonNullable<AutoConfigWranglerTriggerCommand>;
	dryRun: boolean;
}): void {
	sendMetricsEvent(
		"autoconfig_process_ended",
		{
			autoConfigId: getAutoConfigId(),
			command,
			dryRun,
			isCI,
			success,
			...sanitizeError(error),
		},
		{}
	);
}
