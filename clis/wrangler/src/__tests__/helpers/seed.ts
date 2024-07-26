// Seeds the `root` directory on the file system with some data. Use in

import { mkdir, writeFile } from "fs/promises";
import path from "path";

// combination with `dedent` for petty formatting of seeded contents.
export async function seed(files: Record<string, string | Uint8Array>) {
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(name);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
}
