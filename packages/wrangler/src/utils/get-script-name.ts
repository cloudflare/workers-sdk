import type { Config } from "../config";

export function getScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
): string | undefined {
	return args.name ?? config.name;
}
