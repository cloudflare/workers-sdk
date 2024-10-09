import { Box, Text } from "ink";
import { printWranglerBanner } from "..";
import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import { LOCATION_CHOICES } from "./constants";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { DatabaseCreationResult } from "./types";

export async function createD1Database(
	accountId: string,
	name: string,
	location?: string
) {
	let db: DatabaseCreationResult;
	try {
		db = await fetchResult(`/accounts/${accountId}/d1/database`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name,
				...(location && { primary_location_hint: location }),
			}),
		});
	} catch (e) {
		if ((e as { code: number }).code === 7502) {
			throw new UserError("A database with that name already exists");
		}
		throw e;
	}
	return db;
}
export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of the new DB",
			type: "string",
			demandOption: true,
		})
		.option("location", {
			describe:
				"A hint for the primary location of the new DB. Options:\nweur: Western Europe\neeur: Eastern Europe\napac: Asia Pacific\noc: Oceania\nwnam: Western North America\nenam: Eastern North America \n",
			type: "string",
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export const Handler = withConfig<HandlerOptions>(
	async ({ name, config, location }): Promise<void> => {
		await printWranglerBanner();
		const accountId = await requireAuth(config);

		if (location) {
			if (LOCATION_CHOICES.indexOf(location.toLowerCase()) === -1) {
				throw new UserError(
					`Location '${location}' invalid. Valid values are ${LOCATION_CHOICES.join(
						","
					)}`
				);
			}
		}
		const db = await createD1Database(accountId, name, location);

		logger.log(
			renderToString(
				<Box flexDirection="column">
					<Text>
						✅ Successfully created DB &apos;{db.name}&apos;
						{db.created_in_region
							? ` in region ${db.created_in_region}`
							: location
								? ` using primary location hint ${location}`
								: ``}
					</Text>
					<Text>Created your new D1 database.</Text>
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
);
