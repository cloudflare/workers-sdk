import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { hash as blake3hash } from "blake3-wasm";

/**
 * Hash file contents with blake3. Takes a pre-read Buffer and the file
 * extension (without leading dot) so callers can avoid redundant reads.
 */
export function hashFileContents(contents: Buffer, extension: string): string {
	const base64Contents = contents.toString("base64");
	return blake3hash(base64Contents + extension)
		.toString("hex")
		.slice(0, 32);
}

/**
 * Reads the file and returns its blake3 hash.
 */
export async function hashFileAsync(filepath: string): Promise<string> {
	const contents = await readFile(filepath);
	const extension = extname(filepath).substring(1);
	return hashFileContents(contents, extension);
}
