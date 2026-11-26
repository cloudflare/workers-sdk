import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createBLAKE3 } from "hash-wasm";

/**
 * Initialize a reusable hasher for asset manifest hashes.
 *
 * Finish WASM initialization before reading any assets, then hash each file
 * synchronously so concurrent callers only retain one file's contents at a time.
 *
 * @returns A function that hashes a file's base64 contents and extension.
 */
export async function createFileHasher(): Promise<
	(filepath: string) => string
> {
	const hasher = await createBLAKE3();

	return function hashFile(filepath: string): string {
		const contents = readFileSync(filepath);
		const base64Contents = contents.toString("base64");
		const extension = extname(filepath).substring(1);

		return hasher
			.init()
			.update(base64Contents)
			.update(extension)
			.digest("hex")
			.slice(0, 32);
	};
}
