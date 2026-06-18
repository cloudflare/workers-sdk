/**
 * Logger interface for autoconfig output.
 * Callers provide their own implementation (e.g., wrapping `console` or a custom logger).
 */
export interface AutoConfigLogger {
	/** Logs informational output. */
	log(...args: unknown[]): void;
	/** Logs an informational message. */
	info(...args: unknown[]): void;
	/** Logs a warning message. */
	warn(...args: unknown[]): void;
	/** Logs a debug-level message (may be suppressed in production). */
	debug(...args: unknown[]): void;
	/** Logs an error message. */
	error(...args: unknown[]): void;
}

/**
 * Dialog interface for interactive prompts.
 * Callers provide their own implementation (e.g., using `prompts`, `inquirer`, or a custom UI).
 */
export interface AutoConfigDialogs {
	/**
	 * Asks a yes/no confirmation question.
	 *
	 * @param text - The question to display
	 * @param options - Optional defaults and fallback behavior
	 * @returns `true` if confirmed, `false` otherwise
	 */
	confirm(
		text: string,
		options?: { defaultValue?: boolean; fallbackValue?: boolean }
	): Promise<boolean>;

	/**
	 * Prompts the user for a text input.
	 *
	 * @param text - The prompt message
	 * @param options - Optional default value and validation function
	 * @returns The user-provided string
	 */
	prompt(
		text: string,
		options?: {
			defaultValue?: string;
			validate?: (
				value: string
			) => boolean | string | Promise<boolean | string>;
		}
	): Promise<string>;

	/**
	 * Presents a selection list to the user.
	 *
	 * @param text - The prompt message
	 * @param options - Available choices and optional default selection
	 * @returns The selected value
	 */
	select(
		text: string,
		options: {
			choices: Array<{
				title: string;
				value: string;
				description?: string;
			}>;
			defaultOption?: number;
		}
	): Promise<string>;
}

/**
 * Context object that provides external dependencies to the autoconfig system.
 *
 * Callers must provide implementations for `logger` and `dialogs`.
 * All other fields are optional and allow callers to customize behavior
 * (e.g., error reporting, command execution, CI detection).
 */
export interface AutoConfigContext {
	/** Logger used for all autoconfig output. */
	logger: AutoConfigLogger;
	/** Dialogs used for interactive prompts. */
	dialogs: AutoConfigDialogs;
	/**
	 * Runs a shell command in the given directory.
	 *
	 * @param command - The shell command string to execute
	 * @param cwd - The working directory for the command
	 * @param label - A short label for logging (e.g., "[build]")
	 * @returns A promise that resolves when the command completes
	 */
	runCommand: (command: string, cwd: string, label: string) => Promise<void>;
	/**
	 * Returns `true` if running in a non-interactive or CI environment.
	 * Defaults to `() => false` if not provided.
	 *
	 * @returns Whether the current environment is non-interactive
	 */
	isNonInteractiveOrCI?: () => boolean;
	/**
	 * Returns a cache folder path used for detecting cached project state,
	 * or `undefined` if not available.
	 *
	 * @returns The cache folder path, or `undefined`
	 */
	getCacheFolder?: () => string | undefined;
}
