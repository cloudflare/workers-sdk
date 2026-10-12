/**
 * Formats an email event timestamp consistently across detail views.
 *
 * @param timestamp - An ISO timestamp returned by the email API.
 * @returns A readable timestamp, or the original value when it is invalid.
 */
export function formatEmailTimestamp(timestamp: string): string {
	try {
		return new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: true,
		}).format(new Date(timestamp));
	} catch {
		return timestamp;
	}
}
