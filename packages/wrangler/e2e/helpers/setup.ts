import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
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
	await Promise.all(
		Object.entries(files).map(async ([name, contents]) => {
			const filePath = path.resolve(root, name);
			await mkdir(path.dirname(filePath), { recursive: true });
			// Watchers must see complete files, especially when reloading config.
			const temporaryPath = path.join(
				path.dirname(filePath),
				`.${path.basename(filePath)}.${randomUUID()}.tmp`
			);
			try {
				await writeFile(temporaryPath, contents);
				await rename(temporaryPath, filePath);
			} finally {
				await rm(temporaryPath, { force: true });
			}
		})
	);
}

// Removes the given files from the `root` directory on the file system.
export async function removeFiles(root: string, files: string[]) {
	await Promise.all(
		files.map(async (name) => {
			const filePath = path.resolve(root, name);
			await rm(filePath, { force: true });
		})
	);
}
