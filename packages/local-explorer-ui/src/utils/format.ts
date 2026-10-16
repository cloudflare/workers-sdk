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
 * Removes the RFC Message-ID delimiters for display in the interface.
 *
 * @param messageId - A Message-ID with or without surrounding angle brackets
 * @returns The Message-ID without its surrounding angle brackets
 */
export function formatMessageId(messageId: string): string {
	return messageId.replace(/^<|>$/g, "");
}

/**
 * Removes angle brackets used to delimit an address for display in the interface.
 *
 * @param address - An email address with or without angle brackets
 * @returns The email address without angle brackets
 */
export function formatEmailAddress(address: string): string {
	return address.replace(/<([^<>]+)>/g, "$1");
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
