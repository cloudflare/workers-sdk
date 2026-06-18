import {
	APIError,
	getD1ExtraLocationChoices,
	UserError,
} from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import {
	createdResourceConfig,
	sharedResourceCreationArgs,
} from "../utils/add-created-resource-config";
import { getValidBindingName } from "../utils/getValidBindingName";
import { JURISDICTION_CHOICES, LOCATION_CHOICES } from "./constants";
import type { DatabaseCreationResult } from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

// D1's Workers Paid database cap. The 7406 error reports the account's current
// cap (e.g. "...per account (10)"), so a cap below this means the account is on
// the Free plan and can upgrade; at or above it, only a limit increase applies.
const D1_PAID_DATABASE_LIMIT = 50_000;

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
		const errorCode = (e as { code: number }).code;

		if (errorCode === 7502) {
			throw new UserError("A database with that name already exists", {
				telemetryMessage: "d1 create database already exists",
			});
		}

		if (errorCode === 7406) {
			const limitMessage =
				e instanceof APIError
					? e.notes
							.map((note) => note.text)
							.join("\n")
							.replace(/\s*\[code:\s*\d+\]/gi, "")
							.trim()
					: "";

			// The 7406 message reports the account's current cap, e.g. "...per account (10)".
			// A cap below the paid limit means the account is on the free plan and can upgrade.
			const cap = Number(limitMessage.match(/\((\d+)\)/)?.[1]);
			const isFreePlan = Number.isFinite(cap) && cap < D1_PAID_DATABASE_LIMIT;
			const paidLimit = D1_PAID_DATABASE_LIMIT.toLocaleString("en-US");

			// Free-plan accounts get an upgrade pitch plus a no-cost alternative;
			// paid accounts have hit the increasable cap, so point them at the
			// limit-increase guidance instead. Specific limit values (storage,
			// queries) are intentionally left to the linked docs so this message
			// can't go stale.
			const message = isFreePlan
				? dedent`
						You've reached the limit of ${cap.toLocaleString("en-US")} D1 databases on the free plan.

						Need more? The Workers Paid plan ($5/month) raises this to ${paidLimit} databases, with higher storage and query limits too. Upgrade at:
						https://dash.cloudflare.com/${accountId}/workers/plans

						To list your existing databases, run: wrangler d1 list
						To delete a database, run: wrangler d1 delete <database-name>

						To learn more, visit: https://developers.cloudflare.com/d1/platform/limits/ [code: 7406]
					`
				: dedent`
						${limitMessage ? `${limitMessage}.` : "You have reached the maximum number of D1 databases for your account."} To request a higher limit, follow the guidance on the D1 limits page. [code: 7406]
						To learn more about this error, visit:
						https://developers.cloudflare.com/d1/platform/limits/
					`;

			throw new UserError(message, {
				telemetryMessage: "d1 create database limit reached",
			});
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
