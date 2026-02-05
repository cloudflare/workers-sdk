import { UserError } from "@cloudflare/workers-utils";
import isCI from "is-ci";
import { getErrorType } from "../core/handle-errors";
import { sendMetricsEvent } from "../metrics";

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
	appId: string;
};

/**
 * Module-level state that persists for the duration of the autoconfig process.
 */
const autoConfigLocalState: Partial<AutoConfigLocalState> = {};

/**
 * Sets the Wrangler command that triggered the autoconfig flow.
 * Can only be called once per session, subsequent calls will throw an error.
 *
 * @param command The Wrangler command that initiated autoconfig
 * @throws Error if the trigger command has already been set
 */
function setAutoConfigTriggerCommand(
	command: NonNullable<AutoConfigWranglerTriggerCommand>
) {
	autoConfigLocalState.triggerCommand = command;
}

/**
 * Returns the Wrangler command that triggered the autoconfig flow.
 *
 * @returns The trigger command, or `undefined` if not yet set (if the programmatic API was used)
 */
export function getAutoConfigTriggerCommand(): AutoConfigWranglerTriggerCommand {
	return autoConfigLocalState.triggerCommand;
}

/**
 * Returns a unique identifier for the current autoconfig session.
 * Generates a new UUID on first call and returns the same ID for subsequent calls.
 * This ID is used to correlate all telemetry events within a single autoconfig process.
 *
 * @returns A UUID string identifying the current autoconfig session
 */
export function getAutoConfigAppId(): string {
	if (autoConfigLocalState.appId) {
		return autoConfigLocalState.appId;
	}
	autoConfigLocalState.appId = crypto.randomUUID();
	return autoConfigLocalState.appId;
}

/**
 * Sends a telemetry event indicating the autoconfig process has started.
 * This should be called at the beginning of the autoconfig flow, before any
 * detection or configuration occurs.
 *
 * @param command The Wrangler command that initiated the autoconfig process
 */
export function sendAutoConfigProcessStartedMetricsEvent(
	command: NonNullable<AutoConfigWranglerTriggerCommand>
): void {
	setAutoConfigTriggerCommand(command);
	sendMetricsEvent(
		"autoconfig_process_started",
		{
			appId: getAutoConfigAppId(),
			isCI,
			command,
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
 */
export function sendAutoConfigProcessEndedMetricsEvent({
	success,
	error,
}: {
	success: boolean;
	error?: unknown | undefined;
}): void {
	sendMetricsEvent(
		"autoconfig_process_ended",
		{
			appId: getAutoConfigAppId(),
			isCI,
			success,
			...(error
				? {
						errorType: getErrorType(error),
						errorMessage:
							error instanceof UserError ? error.telemetryMessage : undefined,
					}
				: {}),
		},
		{}
	);
}
