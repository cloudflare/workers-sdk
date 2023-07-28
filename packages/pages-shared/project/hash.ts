import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export async function getFileContentsForHashing(filepath: string) {
	const contents = await readFile(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return base64Contents + extension;
}
