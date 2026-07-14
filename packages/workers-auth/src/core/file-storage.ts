import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { readFileSync } from "@cloudflare/workers-utils";
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
			mkdirSync(path.dirname(configPath), { recursive: true });
			writeFileSync(configPath, stringifyFile(format, config), {
				encoding: "utf-8",
				mode: 0o600,
			});
			// `mode` only applies when the file is created, so re-`chmod` on
			// every save to keep 0o600 on shared hosts.
			chmodSync(configPath, 0o600);
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
