import { asyncLocalStoragePlugin } from "./als-external";
import { nodejsHybridPlugin } from "./hybrid-nodejs-compat";
import { nodejsCompatPlugin } from "./nodejs-compat";
import type { Plugin } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Returns the list of ESBuild plugins to use for a given compat mode.
 */
export function getNodeJSCompatPlugins({
	mode,
}: {
	mode: NodeJSCompatMode;
	unenvResolvePaths?: string[];
}): Plugin[] {
	switch (mode) {
		case "als":
			return [asyncLocalStoragePlugin, nodejsCompatPlugin(mode)];
		case "v1":
			return [nodejsCompatPlugin(mode)];
		case "v2":
			return [nodejsHybridPlugin()];
		case null:
			return [nodejsCompatPlugin(mode)];
	}
}
