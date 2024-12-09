import type { configFormat } from "../config";
import type { sniffUserAgent } from "../package-manager";

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
	 * Whether the Wrangler client is running in an interactive instance
	 */
	isInteractive: boolean;
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
				 * The command that was used, e.g. `wrangler dev`
				 */
				command: string;
				/**
				 * The args and flags that were passed in when running the command.
				 * All user-inputted string values are redacted, except for some cases where there are set options.
				 */
				args: Record<string, unknown>;
			};
	  }
	| {
			name: "wrangler command completed";
			properties: CommonEventProperties & {
				/**
				 * The command that was used, e.g. `wrangler dev`
				 */
				command: string | undefined;
				/**
				 * The args and flags that were passed in when running the command.
				 * All user-inputted string values are redacted, except for some cases where there are set options.
				 */
				args: Record<string, unknown> | undefined;
				/**
				 * The time elapsed between the "wrangler command started" and "wrangler command completed" events
				 */
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
			};
	  }
	| {
			name: "wrangler command errored";
			properties: CommonEventProperties & {
				/**
				 * The command that was used, e.g. `wrangler dev`
				 */
				command: string | undefined;
				/**
				 * The args and flags that were passed in when running the command.
				 * All user-inputted string values are redacted, except for some cases where there are set options.
				 */
				args: Record<string, unknown> | undefined;
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
			};
	  };
