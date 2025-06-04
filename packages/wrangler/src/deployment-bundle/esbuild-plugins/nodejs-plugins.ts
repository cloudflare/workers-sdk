import { asyncLocalStoragePlugin } from "./als-external";
import { nodejsHybridPlugin } from "./hybrid-nodejs-compat";
import { nodejsCompatPlugin } from "./nodejs-compat";
import type { Plugin } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Returns the list of ESBuild plugins to use for a given compat mode.
 */
export async function getNodeJSCompatPlugins({
	mode,
	unenvResolvePaths,
}: {
	mode: NodeJSCompatMode;
	unenvResolvePaths?: string[];
}): Promise<Plugin[]> {
	switch (mode) {
		case "als":
			return [asyncLocalStoragePlugin, nodejsCompatPlugin(mode)];
		case "v1":
			return [nodejsCompatPlugin(mode)];
		case "v2":
			return [await nodejsHybridPlugin(unenvResolvePaths)];
		case null:
			return [nodejsCompatPlugin(mode)];
	}
}
