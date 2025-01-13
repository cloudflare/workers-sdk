import { configFileName, formatConfigSnippet } from "../config";
import { CommandLineArgsError } from "../errors";
import { isLegacyEnv } from "./isLegacyEnv";
import type { Config } from "../config";

export function getScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
): string | undefined {
	if (args.name && isLegacyEnv(config) && args.env) {
		throw new CommandLineArgsError(
			`In legacy environment mode you cannot use --name and --env together. If you want to specify a Worker name for a specific environment you can add the following to your ${configFileName(config.configPath)} file:\n` +
				formatConfigSnippet(
					{
						env: {
							[args.env]: {
								name: args.name,
							},
						},
					},
					config.configPath
				)
		);
	}

	return args.name ?? config.name;
}
