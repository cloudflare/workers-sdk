import { existsSync } from "node:fs";
import path from "node:path";
import type { AttachPlatformProxyOptions } from "./attach";
import type { PlatformProxy, PlatformProxyOptions } from "./platform-proxy";

export type { PlatformProxy } from "./platform-proxy";
export type { CacheStorage } from "./caches";
export type { ExecutionContext } from "./execution-context";

/**
 * Options for {@link getPlatformProxy}: where to find `cloudflare.config.ts` and
 * how to emulate its bindings, or the `url` of a runtime to attach to
 */
export type GetPlatformProxyOptions =
	| (PlatformProxyOptions & {
			/**
			 * The path of the project's `cloudflare.config.ts`.
			 * Defaults to `cloudflare.config.ts` in the current working directory.
			 */
			configPath?: string;
			/** The mode `cloudflare.config.ts` is evaluated in. Defaults to `development`. */
			mode?: string;
			/** Pass a `url` to attach to a running runtime instead */
			url?: undefined;
	  })
	| AttachPlatformProxyOptions;

/**
 * Gives code running in Node.js during local development, such as a framework's dev server,
 * the bindings of a Worker. By default, it emulates the bindings declared in the project's
 * `cloudflare.config.ts`. Pass `url` to use the bindings of a runtime that's already running
 * instead, such as a Cloudflare Vite plugin dev server.
 *
 * @param options Where to find `cloudflare.config.ts`, or the runtime to attach to
 * @returns The Worker's bindings, together with `cf`, `ctx` and `caches`
 */
export async function getPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
>(
	options: GetPlatformProxyOptions = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	// Each mode loads only what it needs: attaching never reads a config
	if (options.url !== undefined) {
		const { attachPlatformProxy } = await import("./attach");
		return attachPlatformProxy<Env, CfProperties>(options);
	}

	const configPath = path.resolve(options.configPath ?? "cloudflare.config.ts");
	const configFile = path.basename(configPath);
	if (!existsSync(configPath)) {
		throw new Error(
			`Could not find \`${configFile}\` at ${configPath}. If the project uses a Wrangler configuration file, run \`npx cf migrate\` to generate \`${configFile}\`.`
		);
	}
	const { loadAndParseConfig } = await import("@cloudflare/config");
	const { result } = await loadAndParseConfig(configPath, {
		isPreview: false,
		mode: options.mode ?? "development",
	});
	if (!result.success) {
		const issues = result.error.issues.map(
			(issue) =>
				`  - ${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`
		);
		throw new Error(`Invalid \`${configFile}\`:\n${issues.join("\n")}`);
	}
	if (result.data.worker === undefined) {
		throw new Error(
			`\`${configFile}\` must define a Worker using the \`worker\` property.`
		);
	}

	const { startPlatformProxy } = await import("./platform-proxy");
	return startPlatformProxy<Env, CfProperties>(
		result.data.worker,
		path.dirname(configPath),
		{
			persist: options.persist,
		}
	);
}
