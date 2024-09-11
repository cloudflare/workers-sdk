import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function makeRoot() {
	return mkdtempSync(path.join(os.tmpdir(), "wrangler-smoke-"));
}

// Seeds the `root` directory on the file system with some data. Use in
// combination with `dedent` for petty formatting of seeded contents.
export async function seed(
	root: string,
	files: Record<string, string | Uint8Array>
) {
	// TODO(someday): allow copying/symlinking file/directory paths in seed? like "path`${__dirname}/../fixture`"?
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
}

// Removes the given files from the `root` directory on the file system.
export async function removeFiles(root: string, files: string[]) {
	for (const name of files) {
		const filePath = path.resolve(root, name);
		if (filePath) {
			await rm(filePath);
		}
	}
}
