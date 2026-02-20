/**
 * Escapes a value for use in a delimited text format (e.g., CSV).
 */
function escapeDelimitedValue(
	value: unknown,
	fieldSeparator: string,
	lineTerminator: string,
	encloser: string
): string {
	if (value === null || value === undefined) {
		return "NULL";
	}

	const str = String(value);
	const shouldEscape =
		str.includes(fieldSeparator) ||
		str.includes(lineTerminator) ||
		str.includes(encloser);

	if (!shouldEscape) {
		return str;
	}

	// Escape encloser characters by doubling them
	const escaped = str.replaceAll(encloser, encloser + encloser);
	return `${encloser}${escaped}${encloser}`;
}

/**
 * Converts headers and records into a delimited text format (e.g., CSV, TSV).
 */
export function exportStudioDataAsDelimitedText(
	headers: string[],
	records: unknown[][],
	fieldSeparator: string,
	lineTerminator: string,
	textEncloser: string
): string {
	const lines: string[] = [];

	if (headers.length > 0) {
		const escapedHeaders = headers.map((h) =>
			escapeDelimitedValue(h, fieldSeparator, lineTerminator, textEncloser)
		);
		lines.push(escapedHeaders.join(fieldSeparator));
	}

	for (const record of records) {
		const escapedFields = record.map((value) =>
			escapeDelimitedValue(value, fieldSeparator, lineTerminator, textEncloser)
		);
		lines.push(escapedFields.join(fieldSeparator));
	}

	return lines.join(lineTerminator);
}
