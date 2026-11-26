import { UserError } from "@cloudflare/workers-utils";
import type { LoginOrRefreshFailureReason } from "../flow";

/** Authentication failed before an API request, with a machine-readable reason. */
export class AuthenticationError extends UserError {
	constructor(
		message: string,
		public readonly reason: LoginOrRefreshFailureReason,
		telemetryMessage: string
	) {
		super(message, { telemetryMessage });
	}
}
