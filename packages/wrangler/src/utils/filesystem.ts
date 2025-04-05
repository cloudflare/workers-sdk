import { mkdirSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";

export async function ensureDirectoryExists(filepath: string) {
	const dirpath = path.dirname(filepath);

	await mkdir(dirpath, { recursive: true });
}

export function ensureDirectoryExistsSync(filepath: string) {
	const dirpath = path.dirname(filepath);

	mkdirSync(dirpath, { recursive: true });
}

export {
	maybeGetFile,
	thrownIsDoesNotExistError,
} from "@cloudflare/workers-shared/utils/helpers";
