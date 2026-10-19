import * as path from "node:path";
import {
	readBuildOutputPreview,
	resolvePluginConfig as resolveSharedPluginConfig,
} from "@cloudflare/workers-dev-shared";
import type {
	PluginConfig,
	ResolvedPluginConfig,
} from "@cloudflare/workers-dev-shared";
import type * as vite from "vite";

export { resolveDevOnly } from "@cloudflare/workers-dev-shared";
export type {
	AssetsOnlyResolvedConfig,
	PersistState,
	PluginConfig,
	PreviewResolvedConfig,
	ResolvedAssetsOnlyConfig,
	ResolvedPluginConfig,
	ResolvedWorkerConfig,
	TunnelConfig,
	Worker,
	WorkersResolvedConfig,
} from "@cloudflare/workers-dev-shared";

export async function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): Promise<ResolvedPluginConfig> {
	const mode =
		"mode" in userConfig && typeof userConfig.mode === "string"
			? userConfig.mode
			: viteEnv.mode;
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();

	return resolveSharedPluginConfig(pluginConfig, {
		root,
		mode,
		envDir: resolveEnvDir(root, userConfig.envDir),
		command: viteEnv.command,
		preview: viteEnv.isPreview
			? await readBuildOutputPreview(root, !!process.env.CLOUDFLARE_VITE_BUILD)
			: undefined,
	});
}

/**
 * Resolves Vite's environment directory before `configResolved` is available.
 *
 * @param root The already-resolved Vite root.
 * @param envDir The user-provided Vite `envDir` option.
 * @returns An absolute environment directory, or `false` when disabled.
 */
export function resolveEnvDir(
	root: string,
	envDir: string | false | undefined
): string | false {
	return envDir === false ? false : path.resolve(root, envDir ?? ".");
}
