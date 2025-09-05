import dedent from "ts-dedent";
import { fetchResult } from "../cfetch";
import { updateConfigFile } from "../config";
import { createCommand } from "../core/create-command";
import { getD1ExtraLocationChoices } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { getValidBindingName } from "../utils/getValidBindingName";
import { LOCATION_CHOICES } from "./constants";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { DatabaseCreationResult } from "./types";

export async function createD1Database(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string,
	location?: string
) {
	try {
		return await fetchResult<DatabaseCreationResult>(
			complianceConfig,
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
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the new DB",
		},
		location: {
			type: "string",
			choices: [
				...LOCATION_CHOICES,
				...(getD1ExtraLocationChoices()?.split(",") ?? []),
			],
			description: dedent`
					A hint for the primary location of the new DB. Options:
						weur: Western Europe
						eeur: Eastern Europe
						apac: Asia Pacific
						oc: Oceania
						wnam: Western North America
						enam: Eastern North America

					`,
		},
	},
	positionalArgs: ["name"],
	async handler({ name, location, env }, { config }) {
		const accountId = await requireAuth(config);

		const db = await createD1Database(config, accountId, name, location);

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

		await updateConfigFile(
			(bindingName) => ({
				d1_databases: [
					{
						binding: getValidBindingName(bindingName ?? db.name, "DB"),
						database_name: db.name,
						database_id: db.uuid,
					},
				],
			}),
			config.configPath,
			env
		);
	},
});
