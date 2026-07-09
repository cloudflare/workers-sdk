import { parseTOML } from "@cloudflare/workers-utils";
import TOML from "smol-toml";

/**
 * On-disk serialization format for an auth product's config/credential files.
 *
 * The whole auth layer is product-agnostic; each product (wrangler, cf, …)
 * picks the format its files are written in. Wrangler uses TOML for historical
 * compatibility; newer CLIs (cf) use JSON. The format bundles the three things
 * that vary together: the file extension, how to parse a file body, and how to
 * serialize a value back to disk.
 */
export interface FileFormat {
	/** File extension (no leading dot), e.g. `"toml"` or `"json"`. */
	extension: string;
	/** Parse a file body into a value. Throws on malformed input. */
	parse: (raw: string) => unknown;
	/** Serialize a value to a file body. */
	stringify: (value: object) => string;
}

/** TOML on-disk format (wrangler's historical layout: `<profile>.toml`). */
export const TOML_FILE_FORMAT: FileFormat = {
	extension: "toml",
	parse: (raw) => parseTOML(raw),
	stringify: (value) => TOML.stringify(value),
};

/** JSON on-disk format (`<profile>.json`), tab-indented. */
export const JSON_FILE_FORMAT: FileFormat = {
	extension: "json",
	parse: (raw) => JSON.parse(raw) as unknown,
	stringify: (value) => JSON.stringify(value, null, "\t"),
};
