import { Buffer } from "node:buffer";

export function viewToBuffer(view: ArrayBufferView): ArrayBuffer {
	return view.buffer.slice(
		view.byteOffset,
		view.byteOffset + view.byteLength
	) as ArrayBuffer;
}

export function base64Encode(value: string): string {
	return Buffer.from(value, "utf8").toString("base64");
}
export function base64Decode(encoded: string): string {
	return Buffer.from(encoded, "base64").toString("utf8");
}

/*! Path sanitisation regexps adapted from node-sanitize-filename:
 * https://github.com/parshap/node-sanitize-filename/blob/209c39b914c8eb48ee27bcbde64b2c7822fdf3de/index.js#L4-L37
 *
 * Licensed under the ISC license:
 *
 * Copyright Parsha Pourkhomami <parshap@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the
 * above copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
 * DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 * ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const dotRegexp = /(^|\/|\\)(\.+)(\/|\\|$)/g;
const illegalRegexp = /[?<>*"'^/\\:|\x00-\x1f\x80-\x9f]/g;
const windowsReservedRegexp = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const leadingRegexp = /^[ /\\]+/;
const trailingRegexp = /[ /\\]+$/;

function dotReplacement(match: string, g1: string, g2: string, g3: string) {
	return `${g1}${"".padStart(g2.length, "_")}${g3}`;
}

function underscoreReplacement(match: string) {
	return "".padStart(match.length, "_");
}

export function sanitisePath(unsafe: string): string {
	return unsafe
		.replace(dotRegexp, dotReplacement)
		.replace(dotRegexp, dotReplacement)
		.replace(illegalRegexp, "_")
		.replace(windowsReservedRegexp, "_")
		.replace(leadingRegexp, underscoreReplacement)
		.replace(trailingRegexp, underscoreReplacement)
		.substring(0, 255);
}
