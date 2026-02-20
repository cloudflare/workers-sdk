import type { StudioResultHeader, StudioResultSet } from "../../types/studio";

function escapeSqlString(str: string): string {
	return `'${str.replace(/'/g, `''`)}'`;
}

/**
 * Escapes a value for safe inclusion in an SQL statement.
 *
 * @param value - The value to escape for SQL usage.
 *
 * @returns A string representing the SQL-safe version of the value.
 */
export function escapeSqlValue(value: unknown): string {
	if (value === undefined) {
		return "DEFAULT";
	}

	if (value === null) {
		return "NULL";
	}

	if (typeof value === "string") {
		return escapeSqlString(value);
	}

	if (typeof value === "number") {
		return value.toString();
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (value instanceof ArrayBuffer || Array.isArray(value)) {
		throw new Error("Blob escape is not supported yet");
	}

	throw new Error(value.toString() + " is unrecognized type of value");
}

interface ArrayBasedTransformProps<HeaderType> {
	headers: HeaderType[];
	rows: unknown[][];
	transformHeader: (
		header: HeaderType,
		headerIdx: number
	) => StudioResultHeader;
	transformValue?: (value: unknown, header: StudioResultHeader) => unknown;
}

/**
 * Transforms an array-based SQL result (headers + rows) into Studio result set
 *
 * @param headers - Array of raw header values from the SQL engine.
 * @param headersMapper - Maps each header to a StudioResultHeader with metadata.
 * @param rows - Two-dimensional array representing result rows.
 * @param transformValue - (Optional) Function to transform each cell value.
 */
export function transformStudioArrayBasedResult<HeaderType>({
	headers,
	rows,
	transformHeader,
	transformValue,
}: ArrayBasedTransformProps<HeaderType>): Omit<StudioResultSet, "stat"> {
	// Building the headers
	const usedColumnNames = new Set();

	const resultHeaders = headers.map((header, headerIdx) => {
		const resultHeader = transformHeader(header, headerIdx);
		let finalColumnName = resultHeader.name;

		// Duplicate column name detected — generate a unique name.
		// This can happen when SQL returns non-unique column names,
		// such as in "SELECT 1 AS a, 1 AS a" or from JOIN operations
		// where multiple tables have overlapping column names.
		let i = 1;
		while (usedColumnNames.has(finalColumnName)) {
			finalColumnName = `${resultHeader.name}_${i++}`;
		}

		usedColumnNames.add(finalColumnName);

		return {
			...resultHeader,
			name: finalColumnName,
		} satisfies StudioResultHeader;
	});

	// Mapping the data
	const data = rows.map((row) => {
		return resultHeaders.reduce(
			(acc, header, index) => {
				acc[header.name] = transformValue
					? transformValue(row[index], header)
					: row[index];

				return acc;
			},
			{} as Record<string, unknown>
		);
	});

	return {
		headers: resultHeaders,
		rows: data,
	};
}
