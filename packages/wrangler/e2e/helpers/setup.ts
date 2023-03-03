import assert from "node:assert";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function makeRoot() {
	return await mkdtemp(path.join(os.tmpdir(), "wrangler-smoke-"));
}

// Tagged template literal for removing indentation from a block of text.
// If the first line is empty, it will be ignored.
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

// Seeds the `root` directory on the file system with some data. Use in
// combination with `dedent` for petty formatting of seeded contents.
export async function seed(root: string, files: Record<string, string>) {
	// TODO(someday): allow copying/symlinking file/directory paths in seed? like "path`${__dirname}/../fixture`"?
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
}
