import { mkdir } from "fs/promises";
import path from "path";

export async function ensureDirectoryExists(filepath: string) {
	const dirpath = path.dirname(filepath);

	await mkdir(dirpath, { recursive: true });
}
