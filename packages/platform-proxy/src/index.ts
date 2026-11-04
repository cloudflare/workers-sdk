import { existsSync } from "node:fs";
import path from "node:path";
import { attachPlatformProxy } from "./attach";
import { startPlatformProxy } from "./platform-proxy";
import type { PlatformProxy } from "./platform-proxy";

export type { PlatformProxy } from "./platform-proxy";
export type { CacheStorage } from "./caches";
export type { ExecutionContext } from "./execution-context";

/**
 * Options for {@link getPlatformProxy}: either where to find `cloudflare.config.ts`
 * and how to emulate its bindings, or the `url` of a runtime to attach to
 */
export type GetPlatformProxyOptions =
	| {
			/**
			 * The path of the project's `cloudflare.config.ts`.
			 * Defaults to `cloudflare.config.ts` in the current working directory.
			 */
			configPath?: string;
			/** The mode `cloudflare.config.ts` is evaluated in. Defaults to `development`. */
			mode?: string;
			/**
			 * Whether and where to persist the bindings' data. Defaults to `.cloudflare/state` in
			 * the project directory, which the Cloudflare Vite plugin also uses, so both see the
			 * same data.
			 */
			persist?: boolean | { path: string };
			/**
			 * Whether bindings configured with `dev.remote` connect to the real resources on your
			 * account. Defaults to `true`.
			 */
			remoteBindings?: boolean;
			url?: undefined;
			secret?: undefined;
	  }
	| {
			/**
			 * URL of a runtime that's already running, or of a dev server in front of it, such
			 * as Vite's. The proxy attaches to it instead of reading `cloudflare.config.ts`.
			 */
			url: string | URL;
			/** The runtime's `MINIFLARE_PLATFORM_PROXY_SECRET`, if this process doesn't share it */
			secret?: string;
	  };

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
	if (options.url !== undefined) {
		return attachPlatformProxy<Env, CfProperties>(options.url, options.secret);
	}

	const configPath = path.resolve(options.configPath ?? "cloudflare.config.ts");
	const configFile = path.basename(configPath);
	if (!existsSync(configPath)) {
		throw new Error(`Could not find \`${configFile}\` at ${configPath}.`);
	}
	// Only reading a config needs the config parser
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

	return startPlatformProxy<Env, CfProperties>(
		result.data.worker,
		path.dirname(configPath),
		{
			persist: options.persist,
			mode: options.mode,
			settings: {
				accountId: result.data.accountId,
				complianceRegion: result.data.complianceRegion,
			},
			remoteBindings: options.remoteBindings,
		}
	);
}
