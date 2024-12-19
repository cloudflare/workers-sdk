import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import { asyncLocalStoragePlugin } from "./als-external";
import { nodejsHybridPlugin } from "./hybrid-nodejs-compat";
import { nodejsCompatPlugin } from "./nodejs-compat";
import { standardURLPlugin } from "./standard-url";
import type { Plugin } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Returns the list of ESBuild plugins to use for a given compat mode.
 */
export function getNodeJSCompatPlugins(mode: NodeJSCompatMode): Plugin[] {
	switch (mode) {
		case "als":
			return [asyncLocalStoragePlugin, nodejsCompatPlugin(mode)];
		case "legacy":
			return [
				NodeGlobalsPolyfills({ buffer: true }),
				standardURLPlugin(),
				NodeModulesPolyfills(),
				nodejsCompatPlugin(mode),
			];
		case "v1":
			return [nodejsCompatPlugin(mode)];
		case "v2":
			return [nodejsHybridPlugin()];
		case null:
			return [nodejsCompatPlugin(mode)];
	}
}
