import { Text, Box } from "ink";
import React from "react";
import { fetchResult } from "../cfetch";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import { d1BetaWarning } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { DatabaseCreationResult } from "./types";

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of the new DB",
			type: "string",
			demandOption: true,
		})
		.option("location", {
			describe:
				"A hint for the primary location of the new DB. Options:\nweur: Europe (west)\neeur: Europe (east)\napac: Asia Pacific\nwnam: North America (west)\nenam: North America (east) \n",
			type: "string",
			choices: ["weur", "eeur", "apac", "wnam", "enam"],
		})
		.epilogue(d1BetaWarning);
}

export async function Handler({
	name,
	location,
}: StrictYargsOptionsToInterface<typeof Options>): Promise<void> {
	const accountId = await requireAuth({});

	logger.log(d1BetaWarning);

	let db: DatabaseCreationResult;
	try {
		db = await fetchResult(`/accounts/${accountId}/d1/database`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name,
				...(location && {
					primary_location_hint: location,
				}),
			}),
		});
	} catch (e) {
		if ((e as { code: number }).code === 7502) {
			throw new Error("A database with that name already exists");
		}
		throw e;
	}

	logger.log(
		renderToString(
			<Box flexDirection="column">
				<Text>
					✅ Successfully created DB &apos;{db.name}&apos;
					{location ? ` using primary location hint ${location}` : ``}
				</Text>
				<Text>&nbsp;</Text>
				<Text>
					Add the following to your wrangler.toml to connect to it from a
					Worker:
				</Text>
				<Text>&nbsp;</Text>
				<Text>[[d1_databases]]</Text>
				<Text>
					binding = &quot;DB&quot; # i.e. available in your Worker on env.DB
				</Text>
				<Text>database_name = &quot;{db.name}&quot;</Text>
				<Text>database_id = &quot;{db.uuid}&quot;</Text>
			</Box>
		)
	);
}
