import * as fs from "node:fs";
import * as path from "node:path";
import type * as vite from "vite";

export function checkPublicDir({ publicDir }: vite.ResolvedConfig): boolean {
	let hasPublicAssets = false;

	if (publicDir) {
		try {
			const files = fs.readdirSync(publicDir);

			if (files.length) {
				hasPublicAssets = true;
			}
		} catch (error) {}
	}

	return hasPublicAssets;
}

export function loadViteManifest(directory: string) {
	const contents = fs.readFileSync(
		path.resolve(directory, ".vite", "manifest.json"),
		"utf-8"
	);

	return JSON.parse(contents) as vite.Manifest;
}

export function getImportedAssetPaths(
	viteManifest: vite.Manifest
): Set<string> {
	const assetPaths = Object.values(viteManifest).flatMap(
		(chunk) => chunk.assets ?? []
	);

	return new Set(assetPaths);
}
