import * as nodePath from "node:path";
import * as util from "node:util";
import { createRequestHandler as createSharedRequestHandler } from "@cloudflare/workers-dev-shared";
import semverGte from "semver/functions/gte";
import { version as viteVersion } from "vite";
import * as vite from "vite";
import { warnIfQuickTunnelSseResponse } from "./plugins/tunnel";
import type { PluginContext } from "./context";
import type * as http from "node:http";

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

export function createRequestHandler(
	handler: Parameters<typeof createSharedRequestHandler>[0]
): ReturnType<typeof createSharedRequestHandler> {
	return createSharedRequestHandler(handler, {
		onResponse: (response) =>
			warnIfQuickTunnelSseResponse(response.headers.get("content-type")),
	});
}

/**
 * Identifies Vite's own WebSockets (e.g. HMR), which are left to Vite.
 */
export function isViteWebSocketUpgrade(request: http.IncomingMessage): boolean {
	return request.headers["sec-websocket-protocol"]?.startsWith("vite") ?? false;
}

export function satisfiesMinimumViteVersion(minVersion: string): boolean {
	return semverGte(viteVersion, minVersion);
}

export const isRolldown = "rolldownVersion" in vite;
