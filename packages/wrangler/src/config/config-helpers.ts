import path from "path";
import { findUpSync } from "find-up";

/**
 * Resolve the path to the configuration file, given the `config` and `script` optional command line arguments.
 * `config` takes precedence, then `script`, then we just use the cwd.
 */
export function resolveWranglerConfigPath({
	config,
	script,
}: {
	config?: string;
	script?: string;
}): string | undefined {
	if (config !== undefined) {
		return config;
	}

	const leafPath = script !== undefined ? path.dirname(script) : process.cwd();
	return findWranglerConfig(leafPath);
}

/**
 * Find the wrangler config file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerConfig(
	referencePath: string = process.cwd()
): string | undefined {
	return (
		findUpSync(`wrangler.json`, { cwd: referencePath }) ??
		findUpSync(`wrangler.jsonc`, { cwd: referencePath }) ??
		findUpSync(`wrangler.toml`, { cwd: referencePath })
	);
}
