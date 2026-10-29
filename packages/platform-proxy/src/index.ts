import path from "node:path";
import { loadAndParseConfig } from "@cloudflare/config";
import { formatZodError } from "@cloudflare/workers-utils";
import { startPlatformProxy } from "./platform-proxy";
import type { PlatformProxy, PlatformProxyOptions } from "./platform-proxy";

export type { PlatformProxy } from "./platform-proxy";
export type { CacheStorage } from "./caches";
export type { ExecutionContext } from "./execution-context";

/** Options for {@link getPlatformProxy} */
export type GetPlatformProxyOptions = PlatformProxyOptions & {
	/**
	 * The path of the project's `cloudflare.config.ts`.
	 * Defaults to `cloudflare.config.ts` in the current working directory.
	 */
	configPath?: string;
	/** The mode `cloudflare.config.ts` is evaluated in. Defaults to `development`. */
	mode?: string;
};

/**
 * Emulates the bindings declared in a project's `cloudflare.config.ts`, so that code running in
 * Node.js during local development, such as a framework's dev server, can use them as its
 * Worker would.
 *
 * @param options Where to find `cloudflare.config.ts`, and how to emulate its bindings
 * @returns The Worker's bindings, together with stand-ins for `cf`, `ctx` and `caches`
 */
export async function getPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
>(
	options: GetPlatformProxyOptions = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	const configPath = path.resolve(options.configPath ?? "cloudflare.config.ts");
	const configFile = path.basename(configPath);
	const { result } = await loadAndParseConfig(configPath, {
		isPreview: false,
		mode: options.mode ?? "development",
	});
	if (!result.success) {
		throw new Error(
			`Invalid \`${configFile}\`:\n${formatZodError(result.error)}`
		);
	}
	if (result.data.worker === undefined) {
		throw new Error(
			`\`${configFile}\` must define a Worker using the \`worker\` property.`
		);
	}

	return startPlatformProxy<Env, CfProperties>(
		result.data.worker,
		path.dirname(configPath),
		{ persist: options.persist }
	);
}
