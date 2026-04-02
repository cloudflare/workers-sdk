import { logger } from "../../logger";
import type { EmailSendingSendResponse } from "../index";

export function logSendResult(result: EmailSendingSendResponse): void {
	if (result.delivered.length > 0) {
		logger.log(`Delivered to: ${result.delivered.join(", ")}`);
	}
	if (result.queued.length > 0) {
		logger.log(`Queued for: ${result.queued.join(", ")}`);
	}
	if (result.permanent_bounces.length > 0) {
		logger.warn(`Permanently bounced: ${result.permanent_bounces.join(", ")}`);
	}
	if (
		result.delivered.length === 0 &&
		result.queued.length === 0 &&
		result.permanent_bounces.length === 0
	) {
		logger.log("Email sent successfully.");
	}
}
