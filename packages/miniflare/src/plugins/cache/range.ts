import { ReadableStream } from "stream/web";
import { TextEncoder } from "util";
import { Headers, Response } from "../../http";

const encoder = new TextEncoder();

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
 *
 * @internal
 */
export function _parseRanges(
	rangeHeader: string,
	length: number
): [start: number /* inclusive */, end: number /* inclusive */][] | undefined {
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range

	// Make sure unit is "bytes"
	const prefixMatch = rangePrefixRegexp.exec(rangeHeader);
	if (prefixMatch === null) return; // Invalid unit (Range Not Satisfiable)

	// Accept empty range header
	rangeHeader = rangeHeader.substring(prefixMatch[0].length);
	if (rangeHeader.trimStart() === "") return [];

	// Split ranges after prefix by ","
	const ranges = rangeHeader.split(",");
	const result: [number, number][] = [];
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
			result.push([rangeStart, rangeEnd]);
		} else if (start !== undefined && end === undefined) {
			const rangeStart = parseInt(start);
			if (rangeStart >= length) return; // Start after content (Range Not Satisfiable)
			result.push([rangeStart, length - 1]);
		} else if (start === undefined && end !== undefined) {
			const suffix = parseInt(end);
			if (suffix >= length) return []; // Entire Response
			if (suffix === 0) continue; // Empty range
			result.push([length - suffix, length - 1]);
		} else {
			return; // Invalid range format, missing both start & end (Range Not Satisfiable)
		}
	}
	return result;
}

/** @internal */
export function _getRangeResponse(
	requestRangeHeader: string,
	responseStatus: number,
	responseHeaders: Headers,
	responseBody: Uint8Array
): Response {
	const ranges = _parseRanges(requestRangeHeader, responseBody.byteLength);
	if (ranges === undefined) {
		return new Response(null, {
			status: 416, // Range Not Satisfiable
			headers: { "Content-Range": `bytes */${responseBody.byteLength}` },
		});
	} else if (ranges.length === 0) {
		return new Response(responseBody, {
			status: responseStatus,
			headers: responseHeaders,
		});
	} else if (ranges.length === 1) {
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/206
		const [start, end] = ranges[0];
		responseHeaders.set(
			"Content-Range",
			`bytes ${start}-${end}/${responseBody.byteLength}`
		);
		responseHeaders.set("Content-Length", `${end - start + 1}`);
		return new Response(responseBody.slice(start, end + 1), {
			status: 206, // Partial Content
			headers: responseHeaders,
		});
	} else {
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/206
		const contentType = responseHeaders.get("Content-Type");
		const boundary =
			"miniflare-boundary-" +
			Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
				.toString()
				.padStart(16, "0");
		const stream = new ReadableStream({
			type: "bytes",
			pull(controller) {
				const range = ranges.shift();
				if (range === undefined) {
					controller.enqueue(encoder.encode(`--${boundary}--`));
					return controller.close();
				}

				const [start, end] = range;
				const header = `--${boundary}\r\nContent-Type: ${contentType}\r\nContent-Range: bytes ${start}-${end}/${responseBody.byteLength}\r\n\r\n`;
				controller.enqueue(encoder.encode(header));
				controller.enqueue(responseBody.slice(start, end + 1));
				controller.enqueue(encoder.encode("\r\n"));
			},
		});
		responseHeaders.set(
			"Content-Type",
			`multipart/byteranges; boundary=${boundary}`
		);
		return new Response(stream, {
			status: 206, // Partial Content
			headers: responseHeaders,
		});
	}
}
