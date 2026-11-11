import { existsSync, rmSync } from "node:fs";
import { readFileSync } from "@cloudflare/workers-utils";
import { writeFileAtomically } from "./atomic-write";
import { parseFile, stringifyFile } from "./file-format";
import type { ConfigStorage } from "../config-file";
import type { FileFormat } from "./file-format";

/** Adapter for reading and writing TOML or JSON files. */
export function createFileStorage<T extends object>(
	format: FileFormat,
	getPath: () => string
): ConfigStorage<T> {
	return {
		read: () => {
			const filePath = getPath();
			// Per the `ConfigStorage<T>.read()` contract, the empty state
			// returns `undefined` rather than throwing — that covers both a
			// missing file and a file that exists but can't be parsed as `T`.
			// The read itself is kept outside the try so genuine I/O errors
			// (`EACCES`, `EISDIR`, ...) still propagate; only the parse is
			// treated as "corrupt ⇒ empty".
			if (!existsSync(filePath)) {
				return undefined;
			}
			const contents = readFileSync(filePath);
			try {
				return parseFile(format, contents) as T;
			} catch {
				return undefined;
			}
		},
		write(config) {
			const configPath = getPath();
			writeFileAtomically(configPath, stringifyFile(format, config));
		},
		clear() {
			const configPath = getPath();
			const existed = existsSync(configPath);
			rmSync(configPath, { force: true });
			return existed;
		},
		path: getPath,
	};
}
