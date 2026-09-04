import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { blake3 } from "hash-wasm";

// hash-wasm lazily instantiates its WASM module on the first blake3() call.
// hashFile is invoked concurrently (Promise.all over every asset), so without a
// shared init each concurrent first call would redundantly instantiate the
// module. Awaiting one shared promise caches the instance once up front.
let wasmReady: Promise<unknown> | undefined;

export const hashFile = async (filepath: string) => {
	wasmReady ??= blake3("");
	await wasmReady;

	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return (await blake3(Buffer.from(base64Contents + extension))).slice(0, 32);
};
