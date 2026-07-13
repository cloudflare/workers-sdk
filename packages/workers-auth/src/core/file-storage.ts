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

/**
 * A file-on-disk storage backend, parameterised by the on-disk {@link FileFormat}
 * (TOML for wrangler, JSON for cf) and the path it reads and writes. Used by the
 * temporary-preview-account store and the plaintext auth-profile primitives.
 *
 * `read()` follows the `ConfigStorage<T>` contract: a missing file *or* a file
 * that exists but can't be parsed as `T` is the empty state and returns
 * `undefined`, so a corrupt store is treated as "nothing usable here" (e.g. a
 * stale temporary-account cache is re-minted instead of hard-erroring). Only
 * genuine I/O errors (`EACCES`, `EISDIR`, ...) propagate. This is deliberately
 * distinct from `FileCredentialStore`, which surfaces a corrupt *credential*
 * file as a throw so the user can fix it.
 *
 * Files are written with mode `0o600` on creation and re-`chmod`'d on every
 * save (the `mode` option only applies on creation) so other local users on
 * shared hosts can't read the stored credentials.
 */
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
