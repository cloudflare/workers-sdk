import { UserError } from "@cloudflare/workers-utils";
import { domainToASCII } from "node:url";
import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { resolveTunnelId } from "../client";

/**
 * Hostname validation matching cloudflared's implementation.
 *
 * Cloudflared validates hostnames by converting to IDNA ASCII (punycode)
 * and then applying DNS label/length checks. See:
 * - cloudflared/cmd/cloudflared/tunnel/subcommands.go:996
 */
const nameRegex = /^[_a-zA-Z0-9][-_.a-zA-Z0-9]*$/;
const hostNameRegex = /^[*_a-zA-Z0-9][-_.a-zA-Z0-9]*$/;

function validateName(s: string, allowWildcardSubdomain: boolean): boolean {
	if (allowWildcardSubdomain) {
		return hostNameRegex.test(s);
	}
	return nameRegex.test(s);
}

function toASCIIHostname(input: string): string | null {
	// Allow wildcard subdomains (e.g. *.example.com) like cloudflared.
	const hasWildcardPrefix = input.startsWith("*.");
	const base = hasWildcardPrefix ? input.slice(2) : input;
	const asciiBase = domainToASCII(base);
	if (!asciiBase) {
		return null;
	}
	return hasWildcardPrefix ? `*.${asciiBase}` : asciiBase;
}

export function validateTunnelRouteDnsHostname(
	hostname: string,
	allowWildcardSubdomain: boolean
): string | null {
	const asciiHostname = toASCIIHostname(hostname);
	if (!asciiHostname) {
		return null;
	}

	// DNS max length is 253 characters excluding the optional trailing dot.
	const withoutTrailingDot = asciiHostname.endsWith(".")
		? asciiHostname.slice(0, -1)
		: asciiHostname;
	if (withoutTrailingDot.length > 253) {
		return null;
	}

	for (const label of withoutTrailingDot.split(".")) {
		if (label.length === 0 || label.length > 63) {
			return null;
		}
	}

	if (!validateName(withoutTrailingDot, allowWildcardSubdomain)) {
		return null;
	}

	return asciiHostname;
}

/**
 * Response from the tunnel routes API
 */
interface DNSRouteResult {
	/** Whether the CNAME record was created, updated, or unchanged */
	cname: "new" | "updated" | "unchanged";
	/** The resulting hostname */
	name: string;
}

/**
 * Create a DNS CNAME record pointing to a tunnel.
 *
 * This uses the Cloudflare Tunnel Routes API which handles zone discovery
 * and CNAME record creation server-side.
 *
 * Equivalent to: cloudflared tunnel route dns <tunnel> <hostname>
 */
export const tunnelRouteDnsCommand = createCommand({
	metadata: {
		description: "Route a hostname to a tunnel by creating a DNS CNAME record",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The tunnel name or ID",
		},
		hostname: {
			type: "string",
			demandOption: true,
			description: "The hostname to route (e.g., app.example.com)",
		},
		overwriteDns: {
			type: "boolean",
			default: false,
			alias: "overwrite-dns",
			description: "Overwrite existing DNS record if it exists",
		},
	},
	positionalArgs: ["tunnel", "hostname"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		// Validate hostname before making API call
		const asciiHostname = validateTunnelRouteDnsHostname(args.hostname, true);
		if (!asciiHostname) {
			throw new UserError(`${args.hostname} is not a valid hostname`);
		}

		// Resolve tunnel name to ID if necessary
		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);

		logger.log(`Creating DNS route for "${args.hostname}" to tunnel "${args.tunnel}"`);

		// Find the zone for this hostname
		// We need the zone tag for the API endpoint
		const parts = asciiHostname.split(".");

		// Try to find the zone by checking progressively shorter domain names
		let zoneTag: string | null = null;

		// Use fetchResult to query zones API
		for (let i = 0; i < parts.length - 1; i++) {
			const potentialZone = parts.slice(i).join(".");
			const zones = await fetchResult<Array<{ id: string; name: string }>>(
				config,
				"/zones",
				{ method: "GET" },
				new URLSearchParams({ name: potentialZone })
			);
			const zone = zones.find((z) => z.name === potentialZone);
			if (zone) {
				zoneTag = zone.id;
				break;
			}
		}

		if (!zoneTag) {
			throw new UserError(
				`Could not find a zone for hostname "${args.hostname}".\n\n` +
					`Make sure the domain is added to your Cloudflare account and you have permission to manage DNS records.`
			);
		}

		// Use the Tunnel Routes API (same as cloudflared)
		// PUT /zones/{zoneTag}/tunnels/{tunnelId}/routes
		const result = await fetchResult<DNSRouteResult>(
			config,
			`/zones/${zoneTag}/tunnels/${tunnelId}/routes`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "dns",
					user_hostname: asciiHostname,
					overwrite_existing: args.overwriteDns,
				}),
			}
		);

		metrics.sendMetricsEvent("create tunnel dns route", {
			sendMetrics: config.send_metrics,
		});

		// Format success message based on result (matching cloudflared's output)
		let message: string;
		switch (result.cname) {
			case "new":
				message = `Added CNAME ${result.name} which will route to this tunnel`;
				break;
			case "updated":
				message = `${result.name} updated to route to your tunnel`;
				break;
			case "unchanged":
				message = `${result.name} is already configured to route to your tunnel`;
				break;
		}

		logger.log(message);
	},
});
