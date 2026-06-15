import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { hash as blake3hash, load } from "blake3-wasm";

let loaded: Promise<void> | undefined;
export async function hashFile(filepath: string) {
	await (loaded ??= load());

	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return blake3hash(base64Contents + extension)
		.toString("hex")
		.slice(0, 32);
}
