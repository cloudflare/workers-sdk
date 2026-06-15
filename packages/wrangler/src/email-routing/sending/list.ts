import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listEmailSendingSubdomains, listEmailSendingZones } from "../client";
import { resolveDomain } from "../utils";

export const emailSendingListCommand = createCommand({
	metadata: {
		description:
			"List Email Sending subdomains (all subdomains in the account when no domain is given)",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		domain: {
			type: "string",
			description:
				"Domain whose sending subdomains to list. Lists all subdomains in the account when omitted.",
		},
		"zone-id": {
			type: "string",
			description: "Zone ID (optional, skips zone lookup if provided)",
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		if (args.domain || args.zoneId) {
			const zoneId = args.zoneId
				? args.zoneId
				: (await resolveDomain(config, args.domain ?? "", args.zoneId)).zoneId;
			const subdomains = await listEmailSendingSubdomains(config, zoneId);

			if (subdomains.length === 0) {
				logger.log("No sending subdomains found for this domain.");
				return;
			}

			logger.table(
				subdomains.map((subdomain) => ({
					name: subdomain.name,
					enabled: subdomain.enabled ? "yes" : "no",
					tag: subdomain.tag,
				}))
			);
			return;
		}

		const zones = await listEmailSendingZones(config);
		const subdomainsByZone = await Promise.all(
			zones.map(async (zone) => ({
				zone,
				subdomains: await listEmailSendingSubdomains(config, zone.id),
			}))
		);

		const results = subdomainsByZone.flatMap(({ zone, subdomains }) =>
			subdomains.map((subdomain) => ({
				zone: zone.name,
				name: subdomain.name,
				enabled: subdomain.enabled ? "yes" : "no",
				tag: subdomain.tag,
			}))
		);

		if (results.length === 0) {
			logger.log("No sending subdomains found in this account.");
			return;
		}

		logger.table(results);
	},
});
