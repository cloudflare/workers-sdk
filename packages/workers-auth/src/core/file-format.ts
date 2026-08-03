import { parseTOML } from "@cloudflare/workers-utils";
import TOML from "smol-toml";

/**
 * On-disk serialization format for a CLI's config/credential files.
 *
 * The whole auth layer is CLI-agnostic; each CLI (wrangler, cf, …) picks the
 * format its files are written in. Wrangler uses `"toml"` for historical
 * compatibility; newer CLIs (cf) use `"json"`. The format value doubles as the
 * file extension (no leading dot).
 */
export type FileFormat = "toml" | "json";

interface FileFormatImpl {
	parse: (raw: string) => unknown;
	stringify: (value: object) => string;
}

const FILE_FORMATS: Record<FileFormat, FileFormatImpl> = {
	toml: {
		parse: (raw) => parseTOML(raw),
		stringify: (value) => TOML.stringify(value),
	},
	json: {
		parse: (raw) => JSON.parse(raw) as unknown,
		stringify: (value) => JSON.stringify(value, null, "\t"),
	},
};

/** Parse a file body into a value. Throws on malformed input. */
export function parseFile(format: FileFormat, raw: string): unknown {
	return FILE_FORMATS[format].parse(raw);
}

/** Serialize a value to a file body in the given format. */
export function stringifyFile(format: FileFormat, value: object): string {
	return FILE_FORMATS[format].stringify(value);
}
