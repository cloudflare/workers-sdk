export function formatActionDescription(action: string): string {
	switch (action) {
		case "expire":
			return "expire objects";
		case "transition":
			return "transition to Infrequent Access storage class";
		case "abort-multipart":
			return "abort incomplete multipart uploads";
		default:
			return action;
	}
}

export function isValidDate(dateString: string): boolean {
	const regex = /^\d{4}-\d{2}-\d{2}$/;
	if (!regex.test(dateString)) {
		return false;
	}
	const date = new Date(`${dateString}T00:00:00.000Z`);
	const timestamp = date.getTime();
	if (isNaN(timestamp)) {
		return false;
	}
	const [year, month, day] = dateString.split("-").map(Number);
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() + 1 === month &&
		date.getUTCDate() === day
	);
}

export function isNonNegativeNumber(str: string): boolean {
	if (str === "") {
		return false;
	}
	const num = Number(str);
	return num >= 0;
}

/**
 * Helper to detect if a command errored due to the data catalog validation.
 *
 * @param error The specific error returned by an API
 * @returns True if failed due to data catalog check, false otherwise
 */
export function isDataCatalogConflict(error: unknown): boolean {
	// Check APIError structure
	if (error && typeof error === "object") {
		if ("notes" in error && Array.isArray(error.notes)) {
			const notes = error.notes as Array<{ text: string }>;
			return notes.some((note) =>
				note.text?.includes("Data Catalog is enabled for this bucket")
			);
		}
	}

	// Check regular Error structure
	if (error instanceof Error) {
		// Check for error code 409 and the specific data catalog error message
		const errorMessage = "message" in error ? String(error.message) : "";
		return (
			errorMessage.includes("409") &&
			errorMessage.includes("Data Catalog is enabled for this bucket")
		);
	}

	return false;
}
