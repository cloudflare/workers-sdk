import * as fs from "node:fs";
import type * as vite from "vite";

export function checkPublicDir({ publicDir }: vite.ResolvedConfig) {
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
