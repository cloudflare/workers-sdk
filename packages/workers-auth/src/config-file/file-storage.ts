import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseTOML, readFileSync } from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import type { ConfigStorage } from ".";

/**
 * On-disk serialization format for a config file. The logical shape is the same
 * across formats, so one storage implementation parameterised by format + path
 * serves every consumer.
 */
export type StorageFileFormat = "toml" | "json";

/**
 * Where (and in what format) a config file lives on disk — the only storage
 * knob a consumer configures. Both fields are plain values, so a CLI can
 * configure them entirely from environment variables, with no code injection.
 */
export interface ConfigFileLocation {
	/** Resolve the absolute path to the file. Called on every access. */
	getPath: () => string;
	/** On-disk serialization format. */
	format: StorageFileFormat;
}

/**
 * Infer the {@link StorageFileFormat} from a file path's extension, defaulting
 * to `"toml"` for unknown extensions.
 */
export function storageFormatFromPath(filePath: string): StorageFileFormat {
	return path.extname(filePath).toLowerCase() === ".json" ? "json" : "toml";
}

/**
 * Build a {@link ConfigFileLocation} for a fixed path, inferring the format from
 * the file extension. Useful for env-var-driven configuration.
 */
export function locationFromPath(filePath: string): ConfigFileLocation {
	return { getPath: () => filePath, format: storageFormatFromPath(filePath) };
}

/**
 * Build a file-on-disk {@link ConfigStorage} from a {@link ConfigFileLocation}.
 *
 * `read()` throws when the file is missing or cannot be parsed — callers treat a
 * throw as "nothing stored". Files are written with mode `0o600` on creation and
 * re-`chmod`'d on every save (the `mode` option only applies on creation) so
 * other local users on shared hosts can't read the stored credentials.
 */
export function createFileStorage<T extends object>(
	location: ConfigFileLocation
): ConfigStorage<T> {
	const { getPath, format } = location;

	const parse = (raw: string): T =>
		format === "json" ? (JSON.parse(raw) as T) : (parseTOML(raw) as T);
	const stringify = (config: T): string =>
		format === "json"
			? JSON.stringify(config, null, 2)
			: TOML.stringify(config as Record<string, unknown>);

	return {
		read: () => parse(readFileSync(getPath())),
		write(config) {
			const configPath = getPath();
			mkdirSync(path.dirname(configPath), { recursive: true });
			writeFileSync(configPath, stringify(config), {
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
