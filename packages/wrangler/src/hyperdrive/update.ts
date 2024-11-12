import { readConfig } from "../config";
import { logger } from "../logger";
import { patchConfig } from "./client";
import { getCacheOptionsFromArgs, getOriginFromArgs, upsertOptions } from ".";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(commonYargs: CommonYargsArgv) {
	const yargs = commonYargs
		.positional("id", {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		})
		.options({
			name: { type: "string", describe: "Give your config a new name" },
		});

	return upsertOptions(yargs);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const origin = getOriginFromArgs(true, args);

	logger.log(`🚧 Updating '${args.id}'`);
	const updated = await patchConfig(config, args.id, {
		name: args.name,
		origin,
		caching: getCacheOptionsFromArgs(args),
	});
	logger.log(
		`✅ Updated ${updated.id} Hyperdrive config\n`,
		JSON.stringify(updated, null, 2)
	);
}
