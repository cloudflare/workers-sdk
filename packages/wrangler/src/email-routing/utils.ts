import { UserError } from "@cloudflare/workers-utils";
import { fetchListResult } from "../cfetch";
import { requireAuth } from "../user";
import { retryOnAPIFailure } from "../utils/retry";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

export async function resolveZoneId(
	config: Config,
	args: { zone?: string; zoneId?: string }
): Promise<string> {
	if (args.zoneId) {
		return args.zoneId;
	}

	if (args.zone) {
		const accountId = await requireAuth(config);
		return await getZoneIdByDomain(config, args.zone, accountId);
	}

	throw new UserError(
		"You must provide either --zone (domain name) or --zone-id (zone ID)."
	);
}

async function getZoneIdByDomain(
	complianceConfig: ComplianceConfig,
	domain: string,
	accountId: string
): Promise<string> {
	const zones = await retryOnAPIFailure(() =>
		fetchListResult<{ id: string }>(
			complianceConfig,
			`/zones`,
			{},
			new URLSearchParams({
				name: domain,
				"account.id": accountId,
			})
		)
	);

	const zoneId = zones[0]?.id;
	if (!zoneId) {
		throw new UserError(
			`Could not find zone for \`${domain}\`. Make sure the domain exists in your account.`
		);
	}

	return zoneId;
}
