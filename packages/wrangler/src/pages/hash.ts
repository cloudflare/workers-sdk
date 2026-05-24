import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { blake3 } from "@noble/hashes/blake3.js";

export const hashFile = (filepath: string) => {
	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	const data = new TextEncoder().encode(base64Contents + extension);
	return Buffer.from(blake3(data)).toString("hex").slice(0, 32);
};
