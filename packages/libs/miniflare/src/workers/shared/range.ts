export interface InclusiveRange {
	start: number; // inclusive
	end: number; // inclusive
}

// Matches case-insensitive string "bytes", ignoring surrounding whitespace,
// followed by "=" (example matches: "bytes=...", "ByTeS=...", "   bytes  =...")
const rangePrefixRegexp = /^ *bytes *=/i;

// Matches single range, with optional start/end numbers, ignoring whitespace
// (example matches: "1-2", "1-", "2-", "  1   -    2   ", "  -  " [note this
// last case is invalid and will be handled separately in `_parseRanges`])
const rangeRegexp = /^ *(?<start>\d+)? *- *(?<end>\d+)? *$/;
interface RangeRegexpGroups {
	start?: string;
	end?: string;
}

/**
 * Parses an HTTP `Range` header (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range),
 * returning either:
 * - `undefined` indicating the range is unsatisfiable
 * - An empty array indicating the entire response should be returned
 * - A non-empty array of inclusive ranges of the response to return
 */
export function parseRanges(
	rangeHeader: string,
	length: number
): InclusiveRange[] | undefined {
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range

	// Make sure unit is "bytes"
	const prefixMatch = rangePrefixRegexp.exec(rangeHeader);
	if (prefixMatch === null) return; // Invalid unit (Range Not Satisfiable)

	// Accept empty range header
	rangeHeader = rangeHeader.substring(prefixMatch[0].length);
	if (rangeHeader.trimStart() === "") return [];

	// Split ranges after prefix by ","
	const ranges = rangeHeader.split(",");
	const result: InclusiveRange[] = [];
	for (const range of ranges) {
		const match = rangeRegexp.exec(range);
		if (match === null) return; // Invalid range format (Range Not Satisfiable)
		const { start, end } = match.groups as RangeRegexpGroups;
		if (start !== undefined && end !== undefined) {
			const rangeStart = parseInt(start);
			let rangeEnd = parseInt(end);
			if (rangeStart > rangeEnd) return; // Start after end (Range Not Satisfiable)
			if (rangeStart >= length) return; // Start after content (Range Not Satisfiable)
			if (rangeEnd >= length) rangeEnd = length - 1;
			result.push({ start: rangeStart, end: rangeEnd });
		} else if (start !== undefined && end === undefined) {
			const rangeStart = parseInt(start);
			if (rangeStart >= length) return; // Start after content (Range Not Satisfiable)
			result.push({ start: rangeStart, end: length - 1 });
		} else if (start === undefined && end !== undefined) {
			const suffix = parseInt(end);
			if (suffix >= length) return []; // Entire Response
			if (suffix === 0) continue; // Empty range
			result.push({ start: length - suffix, end: length - 1 });
		} else {
			return; // Invalid range format, missing both start & end (Range Not Satisfiable)
		}
	}
	return result;
}
