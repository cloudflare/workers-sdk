import * as path from "node:path";
import * as wrangler from "wrangler";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";

/**
 * Gets any variables with which to augment the Worker config in preview mode.
 *
 * Calls `unstable_getVarsForDev` with the current Cloudflare environment to get local dev variables from the `.dev.vars` and `.env` files.
 */
export function getLocalDevVarsForPreview(
	configPath: string | undefined,
	cloudflareEnv: string | undefined
): string | undefined {
	const dotDevDotVars = wrangler.unstable_getVarsForDev(
		configPath,
		undefined, // We don't currently support setting a list of custom `.env` files.
		{}, // Don't pass actual vars since these will be loaded from the wrangler.json.
		cloudflareEnv
	);
	const dotDevDotVarsEntries = Array.from(Object.entries(dotDevDotVars));
	if (dotDevDotVarsEntries.length > 0) {
		const dotDevDotVarsContent = dotDevDotVarsEntries
			.map(([key, { value }]) => {
				return `${key} = "${value?.toString().replaceAll(`"`, `\\"`)}"\n`;
			})
			.join("");
		return dotDevDotVarsContent;
	}
}

/**
 * Returns `true` if the `changedFile` matches a `.dev.vars` or `.env` file.
 */
export function hasLocalDevVarsFileChanged(
	{
		configPaths,
		cloudflareEnv,
	}: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	changedFilePath: string
) {
	return [...configPaths].some((configPath) => {
		const configDir = path.dirname(configPath);
		return [
			".dev.vars",
			".env",
			...(cloudflareEnv
				? [`.dev.vars.${cloudflareEnv}`, `.env.${cloudflareEnv}`]
				: []),
		].some(
			(localDevFile) => changedFilePath === path.join(configDir, localDevFile)
		);
	});
}
