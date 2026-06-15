import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serializeConfig } from "../runtime/config";
import { emitConfigText } from "./capnp-text";
import { toStandaloneConfig } from "./transform";
import type { Config } from "../runtime/config";
import type { EmbedSink } from "./capnp-text";
import type {
	StandaloneTransformOptions,
	StandaloneTransformResult,
} from "./transform";

/**
 * How the `Workerd.Config` is written to disk:
 * - `"text"` — human-readable Cap'n Proto with modules/blobs `embed`-ed as
 *   sibling files. Inspectable and diffable; the default.
 * - `"binary"` — a single self-contained encoded Cap'n Proto message (run with
 *   `workerd serve --binary`). No sibling module files; modules are inlined.
 */
export type StandaloneConfigFormat = "text" | "binary";

/** File name written for each {@link StandaloneConfigFormat}. */
export const STANDALONE_CONFIG_FILENAME: Record<
	StandaloneConfigFormat,
	string
> = {
	text: "config.capnp",
	binary: "config.bin",
};

export interface EmitStandaloneOptions extends StandaloneTransformOptions {
	/**
	 * Directory (relative to the config) for embedded module and data files in
	 * `"text"` format. Defaults to `"src"`. Unused for `"binary"` format.
	 */
	embedDir?: string;
	/** Config serialization format. Defaults to `"text"`. */
	format?: StandaloneConfigFormat;
}

export interface EmitStandaloneResult extends StandaloneTransformResult {
	/** Absolute path to the written config file. */
	configPath: string;
	/** Bundle-relative paths of every file written or copied (excluding the config). */
	files: string[];
	/** The format the config was written in. */
	format: StandaloneConfigFormat;
}

/** Strips path traversal and absolute prefixes so `hint` is safe to join under the bundle. */
function safeRelative(hint: string): string {
	const cleaned = hint
		.replace(/\\/g, "/")
		.split("/")
		.filter((segment) => segment !== "" && segment !== "." && segment !== "..")
		.join("/");
	return cleaned === "" ? "module" : cleaned;
}

/**
 * Transforms `config` into a standalone configuration (see {@link toStandaloneConfig})
 * and writes the complete bundle to `outDir`: the config (`"text"` or `"binary"`,
 * see {@link StandaloneConfigFormat}), any `"text"`-format embedded module/data
 * files, and the contents of any `disk` services.
 */
export function emitStandaloneBundle(
	config: Config,
	outDir: string,
	options: EmitStandaloneOptions = {}
): EmitStandaloneResult {
	const result = toStandaloneConfig(config, options);
	const embedDir = options.embedDir ?? "src";
	const format = options.format ?? "text";

	mkdirSync(outDir, { recursive: true });

	const used = new Set<string>();
	const files: string[] = [];

	function reserve(hint: string): string {
		const base = path.posix.join(embedDir, safeRelative(hint));
		let candidate = base;
		if (used.has(candidate)) {
			const ext = path.posix.extname(base);
			const stem = base.slice(0, base.length - ext.length);
			let index = 1;
			do {
				candidate = `${stem}-${index}${ext}`;
				index++;
			} while (used.has(candidate));
		}
		used.add(candidate);
		return candidate;
	}

	function writeRelative(relative: string, content: string | Uint8Array): void {
		const destination = path.join(outDir, ...relative.split("/"));
		mkdirSync(path.dirname(destination), { recursive: true });
		writeFileSync(destination, content);
		files.push(relative);
	}

	const configPath = path.join(outDir, STANDALONE_CONFIG_FILENAME[format]);
	if (format === "binary") {
		// Binary config inlines all modules/blobs, so there's nothing to embed —
		// only the (read-only) `disk` contents need to live alongside it.
		writeFileSync(configPath, serializeConfig(result.config));
	} else {
		const sink: EmbedSink = {
			embedText(hint, content) {
				const relative = reserve(hint);
				writeRelative(relative, content);
				return relative;
			},
			embedBinary(hint, content) {
				const relative = reserve(hint);
				writeRelative(relative, content);
				return relative;
			},
		};
		writeFileSync(configPath, emitConfigText(result.config, sink));
	}

	for (const copy of result.diskCopies) {
		const destination = path.join(outDir, ...copy.to.split("/"));
		mkdirSync(path.dirname(destination), { recursive: true });
		cpSync(copy.from, destination, { recursive: true });
		files.push(copy.to);
	}

	return { ...result, configPath, files, format };
}
