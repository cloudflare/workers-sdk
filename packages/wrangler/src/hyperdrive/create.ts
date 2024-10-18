import { readConfig } from "../config";
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
	const config = readConfig(args.config, args);
	const origin = getOriginFromArgs(false, args);

	logger.log(`🚧 Creating '${args.name}'`);
	const database = await createConfig(config, {
		name: args.name,
		origin,
		caching: getCacheOptionsFromArgs(args),
	});
	logger.log(
		`✅ Created new Hyperdrive config\n`,
		JSON.stringify(database, null, 2)
	);
}
