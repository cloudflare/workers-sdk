import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function ensureDirectoryExists(filepath: string) {
	const dirpath = path.dirname(filepath);

	await mkdir(dirpath, { recursive: true });
}

export function ensureDirectoryExistsSync(filepath: string) {
	const dirpath = path.dirname(filepath);

	mkdirSync(dirpath, { recursive: true });
}
