import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { blake3 } from "hash-wasm";

/**
 * Warm hash-wasm's internal WASM cache before fanning out concurrent
 * `hashFile` calls. Without this, every cold call takes the cache-miss path
 * and instantiates its own WASM module behind a mutex while retaining its
 * file buffer.
 */
export async function initHash() {
	await blake3(new Uint8Array());
}

export const hashFile = async (filepath: string) => {
	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return (await blake3(Buffer.from(base64Contents + extension))).slice(0, 32);
};
