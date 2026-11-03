import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { getWasmSourceMappingUrl } from "@cloudflare/workers-utils";

/** A WebAssembly module's source map, as read by `readWasmSourceMap`. */
export interface WasmSourceMap {
	/** A file name for the map that is unique to its module. */
	fileName: string;
	/** The map's contents. */
	sourceMap: Record<string, unknown>;
}

/**
 * Reads the source map named by a WebAssembly module's `sourceMappingURL`
 * section.
 *
 * @param modulePath The module's path on disk.
 * @param source The module's bytes.
 * @returns The map's contents and a file name for it that is unique to the
 * module, or `undefined` if the module has no section or names a map by an
 * absolute URL, such as one from Emscripten's `--source-map-base`, which is
 * hosted elsewhere.
 * @throws If the section names a `data:` URL, a file outside the module's
 * directory, or a file that can't be read as JSON.
 */
export async function readWasmSourceMap(
	modulePath: string,
	source: Uint8Array
): Promise<WasmSourceMap | undefined> {
	const sourceMapUrl = getWasmSourceMappingUrl(source);
	if (sourceMapUrl === undefined) {
		return undefined;
	}
	if (sourceMapUrl.startsWith("data:")) {
		throw new Error("expected a file path but found a data URL.");
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(sourceMapUrl)) {
		return undefined;
	}

	// Toolchains write the map next to the module. Reading only there stops a
	// module from naming an unrelated file elsewhere on disk.
	const moduleDir = path.dirname(modulePath);
	const sourceMapPath = path.resolve(moduleDir, sourceMapUrl);
	const relativePath = path.relative(moduleDir, sourceMapPath);
	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativePath)
	) {
		throw new Error("expected a file in the module's directory.");
	}
	const sourceMap = JSON.parse(
		await fsp.readFile(sourceMapPath, "utf8")
	) as Record<string, unknown>;
	// Modules from different directories can name maps with the same name, so
	// name each map after its module and a hash of the module, as Vite names
	// assets.
	const hash = crypto
		.createHash("sha256")
		.update(source)
		.digest("hex")
		.slice(0, 8);
	return {
		fileName: `${path.basename(modulePath, ".wasm")}-${hash}.wasm.map`,
		sourceMap,
	};
}
