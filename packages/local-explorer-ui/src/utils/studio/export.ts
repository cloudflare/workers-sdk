import type {
	IStudioDriver,
	StudioExportOption,
	StudioResultSet,
} from "../../types/studio";

/**
 * Converts a result value to its string representation.
 *
 * @param value - The value to convert (string, number, Date, ArrayBuffer, or other).
 *
 * @returns The string representation of the value.
 */
function convertResultValueToString(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number") {
		return value.toString();
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof ArrayBuffer) {
		return Array.from(new Uint8Array(value))
			.map((x) => x.toString(16).padStart(2, "0"))
			.join("");
	}

	return JSON.stringify(value);
}

interface CreateDownloadLinkOptions {
	content: string;
	contentType: string;
	extension: string;
	filename: string;
}

/**
 * Creates a temporary download link and triggers a file download in the browser.
 *
 * @param options - The download configuration options.
 * @param options.content - The file content to download.
 * @param options.contentType - The MIME type of the content.
 * @param options.extension - The file extension (e.g., '.csv', '.sql').
 * @param options.filename - The desired filename for the download.
 */
function createDownloadLink({
	content,
	contentType,
	extension,
	filename,
}: CreateDownloadLinkOptions): void {
	const blob = new Blob([content], { type: contentType });

	const cleanedFilename = (filename.trim() || "export")
		.replace(/[<>:"/\\|?*]/g, "_")
		.replace(/^\.+/, "_");

	const safeCleanedFilename = cleanedFilename.endsWith(extension)
		? cleanedFilename
		: `${cleanedFilename}${extension}`;

	// Download the file
	try {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = safeCleanedFilename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		// Delay URL revocation to ensure download starts in all browsers
		setTimeout(() => URL.revokeObjectURL(url), 100);
	} catch (error) {
		console.error("Export failed:", error);
	}
}

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
 * Exports a studio result set as a CSV file and triggers a browser download.
 *
 * @param result - The studio result set containing headers and rows to export.
 * @param option - Export options including filename, separator, and formatting preferences.
 */
export function exportCSVFromStudioResult(
	result: StudioResultSet,
	option: StudioExportOption
): void {
	const { filename, includeColumnName, lineTerminator, nullValue, separator } =
		option;

	const separatorChar =
		separator === "COMMA" ? "," : separator === "SEMICOLON" ? ";" : "\t";

	const lineTerminatorChar = lineTerminator === "CRLF" ? "\r\n" : "\n";

	const nullValueString = nullValue === "EMPTY_STRING" ? "" : "NULL";

	const headerRow = includeColumnName
		? result.headers
				.map((header) => quoteValue(header.name, separatorChar))
				.join(separatorChar)
		: "";

	let csvContent: string = includeColumnName
		? headerRow + lineTerminatorChar
		: "";

	for (const row of result.rows) {
		csvContent += result.headers
			.map((header) => {
				const cellValue = row[header.name];
				return cellValue === null || cellValue === undefined
					? nullValueString
					: quoteValue(convertResultValueToString(cellValue), separatorChar);
			})
			.join(separatorChar);

		csvContent += lineTerminatorChar;
	}

	createDownloadLink({
		content: csvContent,
		contentType: "text/csv",
		extension: ".csv",
		filename,
	});
}

/**
 * Exports a studio result set as SQL INSERT statements and triggers a browser download.
 *
 * @param result - The studio result set containing headers and rows to export.
 * @param driver - The studio driver used for escaping identifiers and values.
 * @param option - Export options including table name, filename, batch size, and max statement length.
 */
export function exportSQLFromStudioResult(
	result: StudioResultSet,
	driver: IStudioDriver,
	option: StudioExportOption
): void {
	let statements = "";
	const { tableName, filename, batchSize, maxStatementLength } = option;

	// Building the `INSERT` prefix
	const insertPrefix = [
		"INSERT INTO ",
		driver.escapeId(tableName || "Unknown"),
		"(",
		result.headers.map((header) => driver.escapeId(header.name)).join(", "),
		") VALUES",
	].join("");

	// We add ; and new line to end each statement
	const BATCH_TERMINATOR_SIZE = 2;

	// Batching
	let batchValues = "";
	let batchCount = 0;
	for (const row of result.rows) {
		const currentValue =
			"(" +
			result.headers
				.map((header) => {
					const cellValue = row[header.name];
					return cellValue === null || cellValue === undefined
						? "NULL"
						: driver.escapeValue(cellValue);
				})
				.join(", ") +
			")";

		batchCount += 1;
		const predictStatementSize =
			insertPrefix.length +
			batchValues.length +
			currentValue.length +
			BATCH_TERMINATOR_SIZE;

		// Create a new batch if we've reached the size limit or statement length limit,
		// but only if we have at least one value in the current batch to avoid empty batches
		const shouldCreateNewBatch =
			(predictStatementSize > maxStatementLength || batchCount > batchSize) &&
			// Ensure we have at least one value in the current batch to prevent infinite loops
			// when maxStatementLength is smaller than a single INSERT statement
			batchCount > 1;

		if (shouldCreateNewBatch) {
			statements += insertPrefix + batchValues + ";\n";
			batchValues = currentValue;
			batchCount = 1;
			continue;
		}

		batchValues += (batchValues ? ", " : "") + currentValue;
	}

	if (batchValues) {
		statements += insertPrefix + batchValues + ";\n";
	}

	createDownloadLink({
		content: statements,
		contentType: "text/sql",
		extension: ".sql",
		filename,
	});
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
	const lines = new Array<string>();

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

/**
 * Quotes a value for CSV output if it contains special characters.
 *
 * @param value - The string value to potentially quote.
 * @param separatorChar - The separator character used in the CSV.
 *
 * @returns The value, quoted and escaped if necessary.
 */
function quoteValue(value: string, separatorChar: string): string {
	return value.includes(separatorChar) ||
		value.includes("\n") ||
		value.includes("\r") ||
		value.includes('"')
		? `"${value.replace(/"/g, '""')}"`
		: value;
}
