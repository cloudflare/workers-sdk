/**
 * Browser DevTools will send `Network.loadNetworkResource` commands for source
 * maps and source files. We only want to allow files referenced by the bundle
 * to be requested (to prevent arbitrary file access). This module exports
 * functions for checking whether a specific file may be requested as a source
 * file, or source map (i.e. is safe to serve from the file system).
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { RawSourceMap } from "source-map";

export function isAllowedSourcePath(
	bundle: EsbuildBundle,
	filePath: string
): boolean {
	const allowed = getBundleReferencedPaths(bundle);
	return allowed.sourcePaths.has(filePath);
}
export function isAllowedSourceMapPath(
	bundle: EsbuildBundle,
	filePath: string
): boolean {
	const allowed = getBundleReferencedPaths(bundle);
	return allowed.sourceMapPaths.has(filePath);
}

interface BundleReferencedPaths {
	sourcePaths: Set<string>;
	sourceMapPaths: Set<string>;
}
const bundleReferencedPathsCache = new WeakMap<
	EsbuildBundle,
	BundleReferencedPaths
>();
function getBundleReferencedPaths(
	bundle: EsbuildBundle
): BundleReferencedPaths {
	let allowed = bundleReferencedPathsCache.get(bundle);
	if (allowed !== undefined) return allowed;
	allowed = { sourcePaths: new Set(), sourceMapPaths: new Set() };
	bundleReferencedPathsCache.set(bundle, allowed);

	for (const sourcePath of getBundleSourcePaths(bundle)) {
		// We don't need to add `sourcePath` to `allowed` here, as DevTools sends
		// `Debugger.getScriptSource` commands instead, which get the code from V8.

		const sourceMappingURL = maybeGetSourceMappingURL(sourcePath);
		if (sourceMappingURL === undefined) continue;
		const sourceMappingPath = fileURLToPath(sourceMappingURL);
		allowed.sourceMapPaths.add(sourceMappingPath);

		const sourceMapData = fs.readFileSync(sourceMappingPath, "utf8");
		const sourceMap: RawSourceMap = JSON.parse(sourceMapData);

		const sourceRoot = sourceMap.sourceRoot ?? "";
		for (const source of sourceMap.sources) {
			const sourceURL = new URL(
				path.posix.join(sourceRoot, source),
				sourceMappingURL
			);
			allowed.sourcePaths.add(fileURLToPath(sourceURL));
		}
	}

	return allowed;
}

function* getBundleSourcePaths(bundle: EsbuildBundle): Generator<string> {
	yield bundle.path;
	for (const module of bundle.modules) {
		if (module.type !== "esm" && module.type !== "commonjs") continue;
		if (module.filePath === undefined) continue;
		yield module.filePath;
	}
}

function maybeGetSourceMappingURL(sourcePath: string): URL | undefined {
	const source = fs.readFileSync(sourcePath, "utf8");
	const sourceMappingURLIndex = source.lastIndexOf("//# sourceMappingURL=");
	if (sourceMappingURLIndex === -1) return;

	const sourceMappingURLMatch = source
		.substring(sourceMappingURLIndex)
		.match(/^\/\/# sourceMappingURL=(.+)/);
	assert(sourceMappingURLMatch !== null);
	const sourceMappingURLSpecifier = sourceMappingURLMatch[1];

	const sourceURL = pathToFileURL(sourcePath);
	try {
		const sourceMappingURL = new URL(sourceMappingURLSpecifier, sourceURL);
		if (sourceMappingURL.protocol !== "file:") return;
		return sourceMappingURL;
	} catch {
		// If we can't parse `sourceMappingURLSpecifier`, ignore it
	}
}
