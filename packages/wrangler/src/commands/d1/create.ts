import {
	getD1ExtraLocationChoices,
	UserError,
} from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import {
	createdResourceConfig,
	sharedResourceCreationArgs,
} from "../../utils/add-created-resource-config";
import { getValidBindingName } from "../../utils/getValidBindingName";
import { JURISDICTION_CHOICES, LOCATION_CHOICES } from "./constants";
import type { DatabaseCreationResult } from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export async function createD1Database(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string,
	location?: string,
	jurisdiction?: string
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
					...(jurisdiction && { jurisdiction }),
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
		description:
			"Creates a new D1 database, and provides the binding and UUID that you will put in your config file",
		epilogue: "This command acts on remote D1 Databases.",
		status: "stable",
		owner: "Product: D1",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the new D1 database",
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
		jurisdiction: {
			type: "string",
			choices: [...JURISDICTION_CHOICES],
			description: dedent`
				The location to restrict the D1 database to run and store data within to comply with local regulations. Note that if jurisdictions are set, the location hint is ignored. Options:
					eu: The European Union
					fedramp: FedRAMP-compliant data centers
			`,
		},
		...sharedResourceCreationArgs,
	},
	positionalArgs: ["name"],
	async handler({ name, location, jurisdiction, env, ...args }, { config }) {
		const accountId = await requireAuth(config);

		const db = await createD1Database(
			config,
			accountId,
			name,
			location,
			jurisdiction
		);

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

		await createdResourceConfig(
			"d1_databases",
			(bindingName) => ({
				binding: getValidBindingName(bindingName ?? db.name, "DB"),
				database_name: db.name,
				database_id: db.uuid,
			}),
			config.configPath,
			env,
			args
		);
	},
});
