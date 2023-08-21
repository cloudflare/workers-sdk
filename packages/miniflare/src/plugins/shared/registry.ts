import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { RawSourceMap } from "source-map";
import { z } from "zod";
import { Response } from "../../http";
import { Log } from "../../shared";

export const IgnoreSourcePredicateSchema = z
	.function()
	.args(z.string())
	.returns(z.boolean());
export type IgnoreSourcePredicate = z.infer<typeof IgnoreSourcePredicateSchema>;

function maybeParseURL(url: string): URL | undefined {
	if (path.isAbsolute(url)) return;
	try {
		return new URL(url);
	} catch {}
}

export class SourceMapRegistry {
	static PATHNAME_PREFIX = "/core/source-map/";

	constructor(
		private readonly log: Log,
		private readonly loopbackPort: number,
		private readonly ignoreSourcePredicate?: IgnoreSourcePredicate
	) {}

	readonly #map = new Map<string /* id */, string /* sourceMapPath */>();

	register(script: string, scriptPath: string): string /* newScript */ {
		// Try to find the last source mapping URL in the file, if none could be
		// found, return the script as is
		const mappingURLIndex = script.lastIndexOf("//# sourceMappingURL=");
		if (mappingURLIndex === -1) return script;

		// `pathToFileURL()` will resolve `scriptPath` relative to the current
		// working directory if needed
		const scriptURL = pathToFileURL(scriptPath);

		const sourceSegment = script.substring(0, mappingURLIndex);
		const mappingURLSegment = script
			.substring(mappingURLIndex)
			.replace(/^\/\/# sourceMappingURL=(.+)/, (substring, mappingURL) => {
				// If the mapping URL is already a URL (e.g. `data:`), return it as is
				if (maybeParseURL(mappingURL) !== undefined) return substring;

				// Otherwise, resolve it relative to the script, and register it
				const resolvedMappingURL = new URL(mappingURL, scriptURL);
				const resolvedMappingPath = fileURLToPath(resolvedMappingURL);

				// We intentionally register source maps in a map to prevent arbitrary
				// file access via the loopback server.
				const id = crypto.randomUUID();
				this.#map.set(id, resolvedMappingPath);
				mappingURL = `http://localhost:${this.loopbackPort}${SourceMapRegistry.PATHNAME_PREFIX}${id}`;

				this.log.verbose(
					`Registered source map ${JSON.stringify(
						resolvedMappingPath
					)} at ${mappingURL}`
				);

				return `//# sourceMappingURL=${mappingURL}`;
			});

		return sourceSegment + mappingURLSegment;
	}

	async get(url: URL): Promise<Response | undefined> {
		// Try to get source map from registry
		const id = url.pathname.substring(SourceMapRegistry.PATHNAME_PREFIX.length);
		const sourceMapPath = this.#map.get(id);
		if (sourceMapPath === undefined) return;

		// Try to load and parse source map from disk
		let contents: string;
		try {
			contents = await fs.readFile(sourceMapPath, "utf8");
		} catch (e) {
			this.log.warn(
				`Error reading source map ${JSON.stringify(sourceMapPath)}: ${e}`
			);
			return;
		}
		let map: RawSourceMap & { x_google_ignoreList?: number[] };
		try {
			map = JSON.parse(contents);
		} catch (e) {
			this.log.warn(
				`Error parsing source map ${JSON.stringify(sourceMapPath)}: ${e}`
			);
			return;
		}

		// Modify the `sourceRoot` so source files get the correct paths. Note,
		// `sourceMapPath` will always be an absolute path.
		const sourceMapDir = path.dirname(sourceMapPath);
		map.sourceRoot =
			map.sourceRoot === undefined
				? sourceMapDir
				: path.resolve(sourceMapDir, map.sourceRoot);

		// Allow specific source files to be hidden from the DevTools sources panel.
		// (e.g. Wrangler middleware and injected code)
		// See https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.mt2g20loc2ct
		// for more details.
		if (this.ignoreSourcePredicate !== undefined && map.sources !== undefined) {
			const ignoreList: number[] = [];
			for (let i = 0; i < map.sources.length; i++) {
				if (this.ignoreSourcePredicate(map.sources[i])) ignoreList.push(i);
			}
			map.x_google_ignoreList = ignoreList;
		}

		return Response.json(map, {
			// This source map will be served from the loopback server to DevTools,
			// which will likely be on a different origin.
			headers: { "Access-Control-Allow-Origin": "*" },
		});
	}
}
