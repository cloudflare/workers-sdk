import type { IStudioDriver, StudioResultSet } from "../../types/studio";

export interface StudioExportOption {
	type: "CSV" | "SQL";
	includeColumnName: boolean;
	separator: "COMMA" | "SEMICOLON" | "TAB";
	lineTerminator: "CRLF" | "LF";
	nullValue: "EMPTY_STRING" | "NULL";
	filename: string;
	batchSize: number;
	tableName: string;
	maxStatementLength: number;
}

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

function quoteValue(value: string, separatorChar: string): string {
	return value.includes(separatorChar) ||
		value.includes("\n") ||
		value.includes("\r") ||
		value.includes('"')
		? `"${value.replace(/"/g, '""')}"`
		: value;
}

export function exportCSVFromStudioResult(
	result: StudioResultSet,
	option: StudioExportOption
) {
	const { includeColumnName, separator, lineTerminator, nullValue, filename } =
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

	result.rows.forEach((row) => {
		csvContent += result.headers
			.map((header) => {
				const cellValue = row[header.name];
				return cellValue === null || cellValue === undefined
					? nullValueString
					: quoteValue(convertResultValueToString(cellValue), separatorChar);
			})
			.join(separatorChar);

		csvContent += lineTerminatorChar;
	});

	createDownloadLink({
		filename,
		extension: ".csv",
		contentType: "text/csv",
		content: csvContent,
	});
}

export function exportSQLFromStudioResult(
	result: StudioResultSet,
	driver: IStudioDriver,
	option: StudioExportOption
) {
	let statements = "";
	const { tableName, filename, batchSize, maxStatementLength } = option;

	// Building the INSERT prefix
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
		} else {
			batchValues += (batchValues ? ", " : "") + currentValue;
		}
	}

	if (batchValues) {
		statements += insertPrefix + batchValues + ";\n";
	}

	createDownloadLink({
		filename,
		extension: ".sql",
		contentType: "text/sql",
		content: statements,
	});
}

function createDownloadLink({
	filename,
	extension,
	content,
	contentType,
}: {
	filename: string;
	extension: string;
	contentType: string;
	content: string;
}) {
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
