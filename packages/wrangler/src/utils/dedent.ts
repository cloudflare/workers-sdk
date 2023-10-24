import assert from "node:assert";

/**
 * Tagged template literal for removing indentation from a block of text.
 *
 * If the first line is empty, it will be ignored.
 */
export function dedent(strings: TemplateStringsArray, ...values: unknown[]) {
	// Convert template literal arguments back to a regular string
	const raw = String.raw({ raw: strings }, ...values);
	// Split the string by lines
	let lines = raw.split("\n");
	assert(lines.length > 0);

	// If the last line is just whitespace, remove it
	if (lines[lines.length - 1].trim() === "") {
		lines = lines.slice(0, lines.length - 1);
	}

	// Find the minimum-length indent, excluding the first line
	let minIndent = "";
	// (Could use `minIndent.length` for this, but then would need to start with
	// infinitely long string)
	let minIndentLength = Infinity;
	for (const line of lines.slice(1)) {
		const indent = line.match(/^[ \t]*/)?.[0];
		if (indent != null && indent.length < minIndentLength) {
			minIndent = indent;
			minIndentLength = indent.length;
		}
	}

	// If the first line is just whitespace, remove it
	if (lines.length > 0 && lines[0].trim() === "") lines = lines.slice(1);

	// Remove indent from all lines, and return them all joined together
	lines = lines.map((line) =>
		line.startsWith(minIndent) ? line.substring(minIndent.length) : line
	);
	return lines.join("\n");
}
