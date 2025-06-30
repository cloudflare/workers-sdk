import * as fs from "node:fs";
import * as path from "node:path";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";

/**
 * Gets the content of the `.dev.vars` target file
 *
 * Note: This resolves the .dev.vars file path following the same logic
 *       as `loadDotEnv` in `/packages/wrangler/src/config/index.ts`
 *       the two need to be kept in sync
 */
export function getDotDevDotVarsContent(
	configPath: string,
	cloudflareEnv: string | undefined
) {
	const configDir = path.dirname(configPath);

	const defaultDotDevDotVarsPath = `${configDir}/.dev.vars`;
	const inputDotDevDotVarsPath = `${defaultDotDevDotVarsPath}${cloudflareEnv ? `.${cloudflareEnv}` : ""}`;

	const targetPath = fs.existsSync(inputDotDevDotVarsPath)
		? inputDotDevDotVarsPath
		: fs.existsSync(defaultDotDevDotVarsPath)
			? defaultDotDevDotVarsPath
			: null;

	if (targetPath) {
		const dotDevDotVarsContent = fs.readFileSync(targetPath);
		return dotDevDotVarsContent;
	}

	return null;
}

/**
 * Returns `true` if the `changedFile` matches a `.dev.vars` file.
 */
export function hasDotDevDotVarsFileChanged(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	changedFilePath: string
) {
	return [...resolvedPluginConfig.configPaths].some((configPath) => {
		const dotDevDotVars = path.join(path.dirname(configPath), ".dev.vars");
		if (dotDevDotVars === changedFilePath) {
			return true;
		}

		if (resolvedPluginConfig.cloudflareEnv) {
			const dotDevDotVarsForEnv = `${dotDevDotVars}.${resolvedPluginConfig.cloudflareEnv}`;
			return dotDevDotVarsForEnv === changedFilePath;
		}

		return false;
	});
}
