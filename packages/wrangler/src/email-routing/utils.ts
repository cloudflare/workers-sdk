import { UserError } from "@cloudflare/workers-utils";
import { fetchListResult } from "../cfetch";
import { requireAuth } from "../user";
import { retryOnAPIFailure } from "../utils/retry";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

/**
 * Resolve a zone ID from either --zone (domain name) or --zone-id (direct ID).
 * At least one must be provided.
 */
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

/**
 * Look up a zone ID by domain name, using the same approach as zones.ts getZoneIdFromHost.
 * Uses fetchListResult (cursor-based) rather than fetchPagedListResult (page-based) to match
 * the existing pattern in zones.ts. This is safe because the `name` query parameter filters
 * to an exact domain match, so the result is always 0 or 1 items — pagination is never needed.
 */
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
