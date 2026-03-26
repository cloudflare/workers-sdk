import { APIError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getEmailRoutingSettings, listZones } from "./client";

const CONCURRENCY_LIMIT = 5;

// Error codes that indicate email routing is not configured for this zone
// rather than a real API failure.
const NOT_CONFIGURED_CODES = new Set([
	1000, // not found
	1001, // unknown zone
]);

export const emailRoutingListCommand = createCommand({
	metadata: {
		description: "List zones with Email Routing",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {},
	async handler(_args, { config }) {
		const zones = await listZones(config);

		if (zones.length === 0) {
			logger.log("No zones found in this account.");
			return;
		}

		// Fetch settings concurrently with a concurrency limit to avoid rate limiting
		const results: {
			zone: string;
			"zone id": string;
			enabled: string;
			status: string;
		}[] = [];

		let firstError: unknown = null;

		for (let i = 0; i < zones.length; i += CONCURRENCY_LIMIT) {
			const batch = zones.slice(i, i + CONCURRENCY_LIMIT);
			const batchResults = await Promise.all(
				batch.map(async (zone) => {
					try {
						const settings = await getEmailRoutingSettings(config, zone.id);
						return {
							zone: zone.name,
							"zone id": zone.id,
							enabled: settings.enabled ? "yes" : "no",
							status: settings.status,
						};
					} catch (e) {
						// Distinguish "not configured" from real API errors
						if (
							e instanceof APIError &&
							e.code !== undefined &&
							NOT_CONFIGURED_CODES.has(e.code)
						) {
							return {
								zone: zone.name,
								"zone id": zone.id,
								enabled: "no",
								status: "not configured",
							};
						}
						// Real error — log it and mark this zone as errored
						logger.debug(
							`Failed to get email routing settings for zone ${zone.name}: ${e}`
						);
						if (!firstError) {
							firstError = e;
						}
						return {
							zone: zone.name,
							"zone id": zone.id,
							enabled: "error",
							status:
								e instanceof APIError ? `API error (code ${e.code})` : "error",
						};
					}
				})
			);
			results.push(...batchResults);
		}

		logger.table(results);

		if (firstError) {
			logger.warn(
				`\nFailed to fetch email routing settings for some zones. This may be a permissions issue — ensure your API token has the "Email Routing" read permission.`
			);
			logger.debug(`First error: ${firstError}`);
		}
	},
});
