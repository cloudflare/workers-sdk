import { FatalError, UserError } from "@cloudflare/workers-utils";
import type { TelemetryMessage } from "@cloudflare/workers-utils";

/**
 * Base class for errors where something in a autoconfig frameworks' configuration goes
 * something wrong. These are not reported to Sentry.
 */
export class AutoConfigFrameworkConfigurationError extends UserError {}

/**
 * Error thrown when autoconfig detection fails.
 * Carries detection metadata (`frameworkId`, `configured`) so that callers can
 * extract it for telemetry without the autoconfig library needing to know about
 * the telemetry system.
 */
export class AutoConfigDetectionError extends FatalError {
	/** The detected framework identifier (if detection got far enough to determine it). */
	readonly frameworkId: string | undefined;
	/** Whether the project was already configured at the time of the error. */
	readonly configured: boolean;

	/**
	 * @param message - The human-readable error message.
	 * @param options - Error options including telemetry message, optional code, and detection metadata.
	 */
	constructor(
		message: string,
		options: TelemetryMessage & {
			code?: number;
			frameworkId?: string;
			configured: boolean;
		}
	) {
		super(message, options);
		Object.setPrototypeOf(this, new.target.prototype);
		this.frameworkId = options.frameworkId;
		this.configured = options.configured;
	}
}
