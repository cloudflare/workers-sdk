import path from "node:path";
import { findWranglerConfig, readConfig } from "../../config";
import type { NormalizeAndValidateConfigArgs } from "../../config/validation";

type Args = NormalizeAndValidateConfigArgs & { config?: string };
type Options = Parameters<typeof readConfig>[1];

export function getConfig(
	{ entryPath, args }: { entryPath?: string; args: Args },
	options?: Options
) {
	const configPath =
		args.config || (entryPath && findWranglerConfig(path.dirname(entryPath)));
	return readConfig({ configPath, args }, options);
}
