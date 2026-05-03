import prettyBytes from "pretty-bytes";

/**
 * Formats a byte value into a human-readable string.
 * Uses SI units (kB, MB, GB, etc.)
 *
 * @param bytes - The number of bytes to format
 *
 * @returns A formatted string like "1.34 kB" or "0 B" for undefined values
 */
export function formatSize(bytes: number | undefined): string {
	return prettyBytes(bytes ?? 0);
}

/**
 * Formats a date string into a human-readable UTC format.
 *
 * @param dateString - An ISO date string to format
 *
 * @returns A formatted string like "13 May 2025, 01:11:37 UTC" or "-" for invalid/undefined values
 */
export function formatDate(dateString: string | undefined): string {
	if (!dateString) {
		return "-";
	}

	try {
		const date = new Date(dateString);

		if (isNaN(date.getTime())) {
			return "-";
		}

		return new Intl.DateTimeFormat("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZone: "UTC",
			timeZoneName: "short",
		}).format(date);
	} catch {
		return "-";
	}
}
