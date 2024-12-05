import path from "node:path";
import { findWranglerConfig, readConfig } from "../../config";

type Args = Parameters<typeof readConfig>[1] & { config?: string };
type Options = Parameters<typeof readConfig>[2];

export function getConfig(args: Args, options?: Options, entryPath?: string) {
	const configPath =
		args.config || (entryPath && findWranglerConfig(path.dirname(entryPath)));
	return readConfig(configPath, args, options);
}
