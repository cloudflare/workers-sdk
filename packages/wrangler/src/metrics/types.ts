import type { sniffUserAgent } from "../package-manager";
import type { configFormat } from "@cloudflare/workers-utils";

export type CommonEventProperties = {
	/** The version of the Wrangler client that is sending the event. */
	wranglerVersion: string;
	/**
	 * The platform that the Wrangler client is running on.
	 */
	osPlatform: string;
	/**
	 * The platform version that the Wrangler client is running on.
	 */
	osVersion: string;
	/**
	 * The package manager that the Wrangler client is using.
	 */
	packageManager: ReturnType<typeof sniffUserAgent>;
	/**
	 * The major version of node that the Wrangler client is running on.
	 */
	nodeVersion: number;
	/**
	 * Whether this is the first time the user has used the wrangler client.
	 */
	isFirstUsage: boolean;
	/**
	 * What format is the configuration file? No content from the actual configuration file is sent.
	 */
	configFileType: ReturnType<typeof configFormat>;
	/**
	 * Randomly generated id to tie together started, completed or errored events from one command run
	 */
	amplitude_session_id: number;
	/**
	 * Tracks the order of events in a session (one command run = one session)
	 */
	amplitude_event_id: number;
	/**
	 * Whether the Wrangler client is running in CI
	 */
	isCI: boolean;
	/**
	 * Whether the Wrangler client is running in Pages CI
	 */
	isPagesCI: boolean;
	/**
	 * Whether the Wrangler client is running in Workers CI
	 */
	isWorkersCI: boolean;
	/**
	 * Whether the Wrangler client is running in an interactive instance
	 */
	isInteractive: boolean;
	/**
	 * Whether this is a Worker with static assets
	 */
	hasAssets: boolean;
	/**
	 * A list of normalised argument names/flags that were passed in or are set by default.
	 * Excludes boolean flags set to false.
	 */
	argsUsed: string[];
	/**
	 * Same as argsUsed except concatenated for convenience in Amplitude
	 */
	argsCombination: string;
};

/** We send a metrics event at the start and end of a command run */
export type Events =
	| {
			name: "wrangler command started";
			properties: CommonEventProperties & {
				/**
				 * The command that was used, e.g. `wrangler dev`.
				 * When sensitiveArgs is true, this is truncated to just the command prefix
				 * (e.g., `wrangler secret put` instead of `wrangler secret put MY_KEY`).
				 *
				 * Named `safe_command` to distinguish from historical `command` field which
				 * may have contained sensitive positional arguments in older Wrangler versions.
				 */
				safe_command: string;
				/**
				 * The args and flags that were passed in when running the command.
				 * All user-inputted string values are redacted, except for some cases where there are set options.
				 * When sensitiveArgs is true, this is an empty object.
				 *
				 * Named `safe_args` to distinguish from historical `args` field which
				 * may have contained sensitive data in older Wrangler versions.
				 */
				safe_args: Record<string, unknown>;
				/**
				 * If true, this command handles sensitive data and args have been stripped from telemetry.
				 * Passed from the command definition's metadata.sensitiveArgs.
				 */
				sensitiveArgs: boolean;
			};
	  }
	| {
			name: "wrangler command completed";
			properties: CommonEventProperties & {
				/**
				 * The command that was used, e.g. `wrangler dev`.
				 * When sensitiveArgs is true, this is truncated to just the command prefix.
				 *
				 * Named `safe_command` to distinguish from historical `command` field.
				 */
				safe_command: string | undefined;
				/**
				 * The args and flags that were passed in when running the command.
				 * All user-inputted string values are redacted, except for some cases where there are set options.
				 * When sensitiveArgs is true, this is an empty object.
				 *
				 * Named `safe_args` to distinguish from historical `args` field.
				 */
				safe_args: Record<string, unknown> | undefined;
				/**
				 * The time elapsed between the "wrangler command started" and "wrangler command completed" events
				 */
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
				/**
				 * If true, this command handles sensitive data and args have been stripped from telemetry.
				 * Passed from the command definition's metadata.sensitiveArgs.
				 */
				sensitiveArgs: boolean;
			};
	  }
	| {
			name: "wrangler command errored";
			properties: CommonEventProperties & {
				/**
				 * The command that was used, e.g. `wrangler dev`.
				 * When sensitiveArgs is true, this is truncated to just the command prefix.
				 *
				 * Named `safe_command` to distinguish from historical `command` field.
				 */
				safe_command: string | undefined;
				/**
				 * The args and flags that were passed in when running the command.
				 * All user-inputted string values are redacted, except for some cases where there are set options.
				 * When sensitiveArgs is true, this is an empty object.
				 *
				 * Named `safe_args` to distinguish from historical `args` field.
				 */
				safe_args: Record<string, unknown> | undefined;
				/**
				 * The time elapsed between the "wrangler command started" and "wrangler command errored" events
				 */
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
				/**
				 * Type of error, e.g. UserError, APIError. Does not include stack trace or error message.
				 */
				errorType: string | undefined;
				/**
				 * Sanitised error messages that will not include user information like filepaths or stack traces (e.g. `Asset too large`).
				 */
				errorMessage: string | undefined;
				/**
				 * If true, this command handles sensitive data and args have been stripped from telemetry.
				 * Passed from the command definition's metadata.sensitiveArgs.
				 */
				sensitiveArgs: boolean;
			};
	  };
