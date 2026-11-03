import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { getWasmSourceMappingUrl } from "@cloudflare/workers-utils";
import * as vite from "vite";

/**
 * Reads the source map named by a WebAssembly module's `sourceMappingURL`
 * section, to copy it next to the module emitted as `emittedFileName`.
 *
 * @param modulePath The module's path on disk.
 * @param source The module's bytes.
 * @param emittedFileName The module's file name in the build output.
 * @returns The map's file name in the build output and its contents, or
 * `undefined` if the module has no section or names a map by an absolute URL,
 * such as one from Emscripten's `--source-map-base`, which is hosted elsewhere.
 * @throws If the section names a map that can't be copied: a `data:` URL, a
 * path outside the build output, or a file that can't be read as JSON.
 */
export async function readWasmSourceMap(
	modulePath: string,
	source: Uint8Array,
	emittedFileName: string
): Promise<
	{ fileName: string; sourceMap: Record<string, unknown> } | undefined
> {
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

	const fileName = vite.normalizePath(
		path.join(path.dirname(emittedFileName), sourceMapUrl)
	);
	if (fileName.startsWith("../") || path.isAbsolute(fileName)) {
		throw new Error("expected a path inside the build output.");
	}
	const sourceMap = JSON.parse(
		await fsp.readFile(
			path.join(path.dirname(modulePath), sourceMapUrl),
			"utf8"
		)
	) as Record<string, unknown>;
	return { fileName, sourceMap };
}
