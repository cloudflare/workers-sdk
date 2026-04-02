import { UserError } from "@cloudflare/workers-utils";
import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import { retryOnAPIFailure } from "../utils/retry";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

export async function resolveZoneId(
	config: Config,
	args: { domain?: string; zoneId?: string }
): Promise<string> {
	if (args.zoneId) {
		return args.zoneId;
	}

	if (args.domain) {
		const accountId = await requireAuth(config);
		return await getZoneIdByDomain(config, args.domain, accountId);
	}

	throw new UserError("You must provide a domain or --zone-id.");
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

export interface ResolvedDomain {
	zoneId: string;
	zoneName: string;
	isSubdomain: boolean;
	domain: string;
}

export async function resolveDomain(
	config: Config,
	domain: string,
	zoneId?: string
): Promise<ResolvedDomain> {
	// If zone ID is provided directly, fetch the zone name to determine subdomain status
	if (zoneId) {
		await requireAuth(config);
		const zone = await retryOnAPIFailure(() =>
			fetchResult<{ id: string; name: string }>(config, `/zones/${zoneId}`)
		);
		return {
			zoneId,
			zoneName: zone.name,
			isSubdomain: domain !== zone.name,
			domain,
		};
	}

	const accountId = await requireAuth(config);

	// Walk up the domain labels: try "sub.example.com", then "example.com"
	const labels = domain.split(".");
	for (let i = 0; i <= labels.length - 2; i++) {
		const candidate = labels.slice(i).join(".");
		const zones = await retryOnAPIFailure(() =>
			fetchListResult<{ id: string; name: string }>(
				config,
				`/zones`,
				{},
				new URLSearchParams({
					name: candidate,
					"account.id": accountId,
				})
			)
		);
		if (zones[0]) {
			return {
				zoneId: zones[0].id,
				zoneName: zones[0].name,
				isSubdomain: domain !== zones[0].name,
				domain,
			};
		}
	}

	throw new UserError(
		`Could not find a zone for \`${domain}\`. Make sure the domain or its parent zone exists in your account.`
	);
}
