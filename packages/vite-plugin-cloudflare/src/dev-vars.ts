import * as path from "node:path";
import * as wrangler from "wrangler";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type { Unstable_Config } from "wrangler";

/**
 * Gets any variables with which to augment the Worker config in preview mode.
 *
 * Calls `unstable_getVarsForDev` with the current Cloudflare environment to get local dev variables from the .dev.vars/.env/process.env.
 * When `secrets` is defined in the Worker config, only declared secrets are loaded.
 */
export function getLocalDevVarsForPreview(
	config: Unstable_Config,
	cloudflareEnv: string | undefined
): string | undefined {
	const dotDevDotVars = wrangler.unstable_getVarsForDev(
		config.configPath,
		undefined, // We don't currently support setting a list of custom `.env` files.
		{}, // Don't pass actual vars since these will be loaded from the wrangler.json.
		cloudflareEnv,
		false,
		config.secrets
	);
	const dotDevDotVarsEntries = Array.from(Object.entries(dotDevDotVars));
	if (dotDevDotVarsEntries.length > 0) {
		const dotDevDotVarsContent = dotDevDotVarsEntries
			.map(([key, { value }]) => {
				// `value` is typed as optional but `unstable_getVarsForDev`
				// always populates it; `?? ""` narrows the type for `quoteForDotenv`.
				return `${key}=${quoteForDotenv(value?.toString() ?? "")}\n`;
			})
			.join("");
		return dotDevDotVarsContent;
	}
}

/**
 * Quote a value so that it round-trips through `dotenv.parse` (the parser
 * wrangler uses to read `.dev.vars` back at preview time).
 *
 * dotenv 16's escape rules are surprisingly narrow:
 * - Single-quoted values are literal. No escape processing, no `${...}`
 *   expansion (`dotenv-expand` runs separately and only against unquoted
 *   `.env` values, not `.dev.vars`).
 * - Backtick-quoted values are also literal.
 * - Double-quoted values only unescape `\n` and `\r`. They do NOT unescape
 *   `\"` or `\\`, so any value containing `"` cannot be losslessly written
 *   inside a double-quoted dotenv value, and any value containing literal
 *   `\n`/`\r`/`\` substrings will be mangled if double-quoted.
 *
 * Strategy: pick the first quote character that does not appear in the
 * value. Throw if a value cannot be losslessly serialized rather than
 * silently corrupting it.
 *
 * @internal exported for tests
 */
export function quoteForDotenv(value: string): string {
	if (!value.includes("'")) return `'${value}'`;
	if (!value.includes("`")) return `\`${value}\``;
	if (!value.includes('"') && !/[\\\n\r]/.test(value)) return `"${value}"`;
	throw new Error(
		"Unable to serialize value to .dev.vars: contains every supported quote character or unsafe escape sequence."
	);
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
