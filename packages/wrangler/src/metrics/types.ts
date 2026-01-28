import type { sniffUserAgent } from "../package-manager";
import type { configFormat } from "@cloudflare/workers-utils";

export type CommonEventProperties = {
	/** The version of the Wrangler client that is sending the event. */
	wranglerVersion: string;
	/** The major version component of the Wrangler client. */
	wranglerMajorVersion: number;
	/** The minor version component of the Wrangler client. */
	wranglerMinorVersion: number;
	/** The patch version component of the Wrangler client. */
	wranglerPatchVersion: number;
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
	/**
	 * The detected AI agent environment ID, if any (e.g., "claude-code", "cursor-agent").
	 * Null if not running in an agentic environment.
	 */
	agent: string | null;
};

/**
 * Properties included in all "wrangler command started / completed / errored" events
 */
type CommandEventProperties = CommonEventProperties & {
	/**
	 * The command that is being run, e.g. `r2 bucket create`. It does not include the "wrangler" prefix.
	 *
	 * No user-inputted positional arguments or flags are allowed in this field.
	 * It is named `sanitizedCommand` to distinguish it from the historical `command` field which
	 * may have contained sensitive positional arguments in older Wrangler versions.
	 */
	sanitizedCommand: string;
	/**
	 * Sanitized positional args and named flags that were passed in when running the command.
	 *
	 * Only args that are explicitly allowed via the `COMMAND_ARG_ALLOW_LIST` will appear here.
	 * See `getAllowedArgs()` and `sanitizeArgValues()` for details.
	 *
	 * For example, if the user ran `wrangler kv key get <key> --format=json --namespace-id ns_12345`,
	 * the sanitized args would only contain `{ format: "json" }` since that is the only allowed value.
	 * The `<key>` positional argument and `--namespace-id` flag would be omitted since they are not allowed.
	 *
	 * It is named `sanitizedArgs` to distinguish it from the historical `args` field which
	 * may have contained sensitive data in older Wrangler versions.
	 */
	sanitizedArgs: Record<string, unknown>;
};

/** We send a metrics event at the start and end of a command run */
export type Events =
	| {
			name: "wrangler command started";
			properties: CommandEventProperties;
	  }
	| {
			name: "wrangler command completed";
			properties: CommandEventProperties & {
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
			properties: CommandEventProperties & {
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
			};
	  };
