import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export function hashFile(filepath: string) {
	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return bytesToHex(blake3(Buffer.from(base64Contents + extension))).slice(
		0,
		32
	);
}
