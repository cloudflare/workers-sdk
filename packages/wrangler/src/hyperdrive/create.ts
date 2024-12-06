import { configFileName, formatConfigSnippet, readConfig } from "../config";
import { logger } from "../logger";
import { createConfig } from "./client";
import { getCacheOptionsFromArgs, getOriginFromArgs, upsertOptions } from ".";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(commonYargs: CommonYargsArgv) {
	const yargs = commonYargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Hyperdrive config",
		})
		.default({
			"origin-scheme": "postgresql",
		});

	return upsertOptions(yargs);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig({ configPath: args.config, args });
	const origin = getOriginFromArgs(false, args);

	logger.log(`🚧 Creating '${args.name}'`);
	const database = await createConfig(config, {
		name: args.name,
		origin,
		caching: getCacheOptionsFromArgs(args),
	});
	logger.log(`✅ Created new Hyperdrive config: ${database.id}`);
	logger.log(
		`📋 To start using your config from a Worker, add the following binding configuration to your ${configFileName(config.configPath)} file:\n`
	);
	logger.log(
		formatConfigSnippet(
			{
				hyperdrive: [{ binding: "HYPERDRIVE", id: database.id }],
			},
			config.configPath
		)
	);
}
