import * as nodePath from "node:path";
import * as util from "node:util";
import semverGte from "semver/functions/gte";
import { version as viteVersion } from "vite";
import * as vite from "vite";
import type { PluginContext } from "./context";

export const debuglog = util.debuglog("@cloudflare:vite-plugin");

/**
 * Creates an internal plugin to be used inside the main `vite-plugin-cloudflare` plugin.
 * The provided `name` will be prefixed with `vite-plugin-cloudflare:`.
 */
export function createPlugin(
	name: string,
	pluginFactory: (ctx: PluginContext) => Omit<vite.Plugin, "name">
): (ctx: PluginContext) => vite.Plugin {
	return (ctx) => {
		return {
			name: `vite-plugin-cloudflare:${name}`,
			sharedDuringBuild: true,
			...pluginFactory(ctx),
		};
	};
}

export function getOutputDirectory(
	userConfig: vite.UserConfig,
	environmentName: string
) {
	const rootOutputDirectory = userConfig.build?.outDir ?? "dist";

	return (
		userConfig.environments?.[environmentName]?.build?.outDir ??
		nodePath.join(rootOutputDirectory, environmentName)
	);
}

const postfixRE = /[?#].*$/;
export function cleanUrl(url: string): string {
	return url.replace(postfixRE, "");
}

export type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>;

export type MaybePromise<T> = Promise<T> | T;

export type Defined<T> = Exclude<T, undefined>;

export function withTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : `${path}/`;
}

export function satisfiesMinimumViteVersion(minVersion: string): boolean {
	return semverGte(viteVersion, minVersion);
}

export const isRolldown = "rolldownVersion" in vite;
