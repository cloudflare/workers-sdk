import prettyBytes from "pretty-bytes";

/**
 * Formats a byte value into a human-readable string.
 * Uses SI units (kB, MB, GB, etc.)
 *
 * @param bytes - The number of bytes to format
 *
 * @returns A formatted string like "1.34 kB" or "0 B" for undefined/zero values
 */
export function formatSize(bytes: number | undefined): string {
	if (bytes === undefined || bytes === 0) {
		return "0 B";
	}

	return prettyBytes(bytes);
}

/**
 * Formats a date string into a human-readable UTC format.
 *
 * @param dateString - An ISO date string to format
 *
 * @returns A formatted string like "13 May 2025 01:11:37 GMT" or "-" for invalid/undefined values
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

		// Format: "13 May 2025 01:11:37 GMT"
		const day = date.getUTCDate();
		const month = date.toLocaleString("en-US", {
			month: "short",
			timeZone: "UTC",
		});
		const year = date.getUTCFullYear();
		const time = date.toLocaleString("en-US", {
			hour: "2-digit",
			hourCycle: "h23",
			minute: "2-digit",
			second: "2-digit",
			timeZone: "UTC",
		});

		return `${day} ${month} ${year} ${time} GMT`;
	} catch {
		return "-";
	}
}
