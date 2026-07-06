import { isAgenticEnvironment } from "../environment-detection";
import { drawBox } from "../utils/box";

/**
 * Options for constructing a {@link CLIError}.
 */
export interface CLIErrorOptions {
	/**
	 * A sanitized telemetry label for this error. Set to a static string to
	 * avoid leaking user data into telemetry. Set to `true` to reuse the
	 * selected (human or AI) message as-is. Set to `false` to suppress
	 * telemetry for this error entirely.
	 */
	telemetryMessage: string | boolean;

	/**
	 * Optional process exit code. When set, the CLI process will exit with
	 * this code instead of the default `1`.
	 */
	exitCode?: number;

	/**
	 * Whether this error is caused by the user (bad input, misconfiguration)
	 * as opposed to an internal/unexpected failure.
	 *
	 * When `true` (the default), the error:
	 * - Is **not** reported to Sentry
	 * - Does **not** show "report a bug" messaging
	 */
	isUserError?: boolean;
}

/**
 * Formats an AI-oriented error message for terminal display.
 *
 * The first line becomes the esbuild-formatted `✘ [ERROR]` text, and the
 * rest of the message is wrapped in a Unicode box (via {@link drawBox})
 * so it's visually distinct from surrounding terminal output.
 *
 * @param aiMessage - The raw AI message.
 * @returns The formatted message string.
 */
function formatAgenticMessage(aiMessage: string): string {
	const box = drawBox(aiMessage.split("\n"));

	return `An error occurred, see the following details on how to handle it:\n${box}`;
}

/**
 * Abstract base class for structured CLI errors that provide differentiated
 * messaging for human operators and AI agents.
 *
 * Every concrete subclass must supply both a human-readable message and an
 * AI-optimized message via the constructor. The base
 * class automatically selects the appropriate variant based on the detected
 * execution environment (see {@link isAgenticEnvironment}).
 *
 * Unlike {@link import("@cloudflare/workers-utils").UserError | UserError},
 * `CLIError` extends the standard `Error` class directly. Integration with
 * Wrangler's error pipeline is achieved through the {@link isUserError}
 * flag, which controls Sentry reporting and "report a bug" messaging.
 */
export abstract class CLIError extends Error {
	/** The human-oriented error message. */
	readonly humanMessage: string;

	/** The AI-oriented error message. */
	readonly aiMessage: string;

	/**
	 * Optional process exit code. When set, the CLI process will exit with
	 * this value instead of the default `1`.
	 */
	readonly exitCode: number | undefined;

	/**
	 * Whether this error is caused by the user rather than an internal bug.
	 * When `true`, Sentry reporting and "report a bug" messaging are
	 * suppressed.
	 */
	readonly isUserError: boolean;

	/**
	 * Sanitized telemetry label. Mirrors the semantics of
	 * {@link import("@cloudflare/workers-utils").UserError.telemetryMessage}.
	 */
	readonly telemetryMessage: string | undefined;

	/**
	 * @param humanMessage - The concise, human-readable error message.
	 * @param aiMessage - The verbose, error message intended for AI agents.
	 * @param options - Configuration for telemetry, exit code, and
	 *   user-error classification.
	 */
	constructor(
		humanMessage: string,
		aiMessage: string,
		options: CLIErrorOptions
	) {
		const message = isAgenticEnvironment()
			? formatAgenticMessage(aiMessage)
			: humanMessage;
		super(message);
		// Restore prototype chain so `instanceof` works correctly with
		// subclasses compiled by TypeScript:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);

		this.humanMessage = humanMessage;
		this.aiMessage = aiMessage;
		this.exitCode = options.exitCode;
		this.isUserError = options.isUserError ?? true;
		this.telemetryMessage =
			typeof options.telemetryMessage === "string"
				? options.telemetryMessage
				: options.telemetryMessage
					? message
					: undefined;
	}
}
