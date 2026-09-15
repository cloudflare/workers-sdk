import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { blake3 } from "hash-wasm";

export const hashFile = async (filepath: string) => {
	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return (await blake3(Buffer.from(base64Contents + extension))).slice(0, 32);
};
