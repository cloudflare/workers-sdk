import { fetchResult } from "../cfetch";
import { formatConfigSnippet } from "../config";
import { createCommand } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { LOCATION_CHOICES } from "./constants";
import type { DatabaseCreationResult } from "./types";

export async function createD1Database(
	accountId: string,
	name: string,
	location?: string
) {
	try {
		return await fetchResult<DatabaseCreationResult>(
			`/accounts/${accountId}/d1/database`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name,
					...(location && { primary_location_hint: location }),
				}),
			}
		);
	} catch (e) {
		if ((e as { code: number }).code === 7502) {
			throw new UserError("A database with that name already exists");
		}

		throw e;
	}
}

export const d1CreateCommand = createCommand({
	metadata: {
		description: "Create D1 database",
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		printBanner: true,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the new DB",
		},
		location: {
			type: "string",
			description:
				"A hint for the primary location of the new DB. Options:\nweur: Western Europe\neeur: Eastern Europe\napac: Asia Pacific\noc: Oceania\nwnam: Western North America\nenam: Eastern North America \n",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, location }, { config }) {
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
			`✅ Successfully created DB '${db.name}'${
				db.created_in_region
					? ` in region ${db.created_in_region}`
					: location
						? ` using primary location hint ${location}`
						: ``
			}`
		);
		logger.log("Created your new D1 database.\n");
		logger.log(
			formatConfigSnippet(
				{
					d1_databases: [
						{ binding: "DB", database_name: db.name, database_id: db.uuid },
					],
				},
				config.configPath
			)
		);
	},
});
