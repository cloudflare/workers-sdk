import { FatalError, UserError } from "./errors";
import type Cloudflare from "cloudflare";
import type { ConfigurationGetResponse } from "cloudflare/resources/zero-trust/tunnels/cloudflared";

const LOCAL_TUNNEL_HOSTNAMES = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"0.0.0.0",
	"::",
]);

/**
 * Resolves the named tunnel to hostnames whose ingress rules target the current
 * local dev origin and the token needed to start `cloudflared tunnel run`.
 */
export async function resolveNamedTunnel(
	name: string,
	origin: URL,
	options: { sdk: Cloudflare; accountId: string }
): Promise<{ hostnames: string[]; token: string }> {
	const { sdk, accountId } = options;
	let foundTunnel = false;
	let tunnelId: string | undefined;

	for await (const tunnel of sdk.zeroTrust.tunnels.cloudflared.list({
		account_id: accountId,
		name,
		is_deleted: false,
	})) {
		if (tunnel.name === name) {
			foundTunnel = true;
			tunnelId = tunnel.id;
			break;
		}
	}

	if (!foundTunnel) {
		throw new UserError(
			`No Cloudflare Tunnel named "${name}" was found in this account. Use "wrangler tunnel list" to see available tunnels.`,
			{ telemetryMessage: "tunnel resolve named missing tunnel" }
		);
	}

	if (!tunnelId) {
		throw new FatalError(
			`Tunnel "${name}" was found but has no ID. This is unexpected.`,
			{ telemetryMessage: "tunnel resolve named missing tunnel id" }
		);
	}

	const configuration =
		await sdk.zeroTrust.tunnels.cloudflared.configurations.get(tunnelId, {
			account_id: accountId,
		});
	const ingress = configuration.config?.ingress ?? [];
	const hostnames = getMatchingIngressHostnames(origin, ingress);

	if (hostnames.length === 0) {
		throw new UserError(
			createMissingIngressMessage(
				name,
				origin,
				`https://dash.cloudflare.com/${accountId}/tunnels/${tunnelId}`,
				ingress
			),
			{ telemetryMessage: "tunnel resolve named ingress mismatch" }
		);
	}

	const token = await sdk.zeroTrust.tunnels.cloudflared.token.get(tunnelId, {
		account_id: accountId,
	});

	return { hostnames, token: String(token) };
}

/** Return ingress hostnames whose configured service targets the local origin. */
function getMatchingIngressHostnames(
	origin: URL,
	ingressConfig: ConfigurationGetResponse.Config.Ingress[]
): string[] {
	const hostnames = new Set<string>();
	const originUrl = normalizeURL(origin);

	for (const ingress of ingressConfig) {
		try {
			const serviceUrl = normalizeURL(ingress.service);

			if (ingress.hostname && serviceUrl.toString() === originUrl.toString()) {
				hostnames.add(ingress.hostname);
			}
		} catch {
			// Ignore invalid service URLs in ingress rules.
		}
	}

	return [...hostnames];
}

function normalizeURL(url: URL | string): URL {
	const normalizedUrl = new URL(url);

	if (LOCAL_TUNNEL_HOSTNAMES.has(normalizedUrl.hostname)) {
		normalizedUrl.hostname = "localhost";
	}

	if (!normalizedUrl.port) {
		switch (normalizedUrl.protocol) {
			case "http:":
				normalizedUrl.port = "80";
				break;
			case "https:":
				normalizedUrl.port = "443";
				break;
		}
	}

	return normalizedUrl;
}

function createMissingIngressMessage(
	name: string,
	origin: URL,
	dashboardUrl: string,
	ingress: ConfigurationGetResponse.Config.Ingress[]
): string {
	if (ingress.length === 0) {
		return [
			`Tunnel "${name}" has no routes configured.`,
			"",
			`Add a route for ${origin} in the Cloudflare dashboard:`,
			dashboardUrl,
			"",
		].join("\n");
	}

	return [
		`Tunnel "${name}" has no route for ${origin}`,
		"",
		"Resolved routes:",
		...ingress.map(
			({ hostname, service }) =>
				`  - ${hostname ?? "(no hostname)"} -> ${service}`
		),
		"",
		"Update your local server settings or the tunnel routes in the Cloudflare dashboard:",
		dashboardUrl,
		"",
	].join("\n");
}
