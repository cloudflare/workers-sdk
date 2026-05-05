import { FatalError, UserError } from "@cloudflare/workers-utils";
import { Cloudflare as CloudflareSDK } from "cloudflare";
import type Cloudflare from "cloudflare";
import type { CloudflareTunnel } from "cloudflare/resources/shared";
import type {
	CloudflaredCreateResponse,
	ConfigurationGetResponse,
} from "cloudflare/resources/zero-trust/tunnels/cloudflared";

/**
 * Error message for tunnel permission issues when using OAuth login.
 * Tunnel commands require specific API token permissions that are not yet
 * available via OAuth scopes.
 */
const TUNNEL_PERMISSION_ERROR_MESSAGE = `
Cloudflare Tunnel commands require API token authentication with tunnel permissions.

OAuth login (via 'wrangler login') does not currently include tunnel permissions.
To use tunnel commands, please authenticate using an API token:

1. Create an API token at https://dash.cloudflare.com/profile/api-tokens
2. Create a custom token with:
   - Account > Cloudflare Tunnel > Edit
3. Set the token and account ID as environment variables:
   export CLOUDFLARE_API_TOKEN=<your-token>
   export CLOUDFLARE_ACCOUNT_ID=<your-account-id>

Then run your tunnel command again.
`.trim();

/**
 * Check if an error is a tunnel permission/authentication error
 */
function isTunnelPermissionError(error: unknown): boolean {
	if (error instanceof CloudflareSDK.APIError) {
		// 403 Forbidden or 401 Unauthorized typically indicate permission issues
		if (error.status === 403 || error.status === 401) {
			return true;
		}
	}
	return false;
}

/**
 * Wrap a tunnel API call with error handling.
 * - Permission errors get a helpful message about API token setup.
 * - Other Cloudflare API errors are wrapped as UserError to prevent Sentry spam,
 *   since these are typically user-facing issues (bad input, missing resources, etc.).
 */
async function withTunnelErrorHandling<T>(
	operation: () => Promise<T>
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (isTunnelPermissionError(error)) {
			throw new UserError(TUNNEL_PERMISSION_ERROR_MESSAGE, {
				telemetryMessage: "tunnel api permission error",
			});
		}
		if (error instanceof CloudflareSDK.APIError) {
			throw new UserError(error.message, {
				cause: error,
				telemetryMessage: "tunnel api error",
			});
		}
		throw error;
	}
}

/**
 * Re-export the SDK tunnel type for use by commands.
 */
export type { CloudflareTunnel };

/**
 * Create a new tunnel
 */
export async function createTunnel(
	sdk: Cloudflare,
	accountId: string,
	name: string
): Promise<CloudflareTunnel> {
	return withTunnelErrorHandling(async () => {
		const response = (await sdk.zeroTrust.tunnels.cloudflared.create({
			account_id: accountId,
			name,
			config_src: "cloudflare",
		})) as CloudflaredCreateResponse;

		// Handle both standard tunnel and WARP connector responses
		return normalizeTunnelResponse(response);
	});
}

/**
 * Get a specific tunnel
 */
export async function getTunnel(
	sdk: Cloudflare,
	accountId: string,
	tunnelId: string
): Promise<CloudflareTunnel> {
	return withTunnelErrorHandling(async () => {
		const response = await sdk.zeroTrust.tunnels.cloudflared.get(tunnelId, {
			account_id: accountId,
		});

		return normalizeTunnelResponse(response);
	});
}

/**
 * List all tunnels
 */
export async function listTunnels(
	sdk: Cloudflare,
	accountId: string
): Promise<CloudflareTunnel[]> {
	return withTunnelErrorHandling(async () => {
		const tunnels: CloudflareTunnel[] = [];
		for await (const tunnel of sdk.zeroTrust.tunnels.cloudflared.list({
			account_id: accountId,
		})) {
			tunnels.push(normalizeTunnelResponse(tunnel));
		}

		return tunnels;
	});
}

/**
 * Delete a tunnel
 */
export async function deleteTunnel(
	sdk: Cloudflare,
	accountId: string,
	tunnelId: string
): Promise<void> {
	return withTunnelErrorHandling(async () => {
		await sdk.zeroTrust.tunnels.cloudflared.delete(tunnelId, {
			account_id: accountId,
		});
	});
}

/**
 * Get tunnel token for running cloudflared
 */
export async function getTunnelToken(
	sdk: Cloudflare,
	accountId: string,
	tunnelId: string
): Promise<string> {
	return withTunnelErrorHandling(async () => {
		const response = await sdk.zeroTrust.tunnels.cloudflared.token.get(
			tunnelId,
			{
				account_id: accountId,
			}
		);

		// The SDK types declare this as string
		return String(response);
	});
}

/**
	 * Resolve a named tunnel to the hostnames that route to the local dev port,
	 * plus the run token needed to start `cloudflared tunnel run`.
	 */
export async function resolveNamedTunnel(
	sdk: Cloudflare,
	accountId: string,
	name: string,
	origin: URL
): Promise<{
	hostnames: string[];
	token: string;
}> {
	const tunnel = await withTunnelErrorHandling(async () => {
		for await (const tunnel of sdk.zeroTrust.tunnels.cloudflared.list({
			account_id: accountId,
			name,
			is_deleted: false,
		})) {
			if (tunnel.name === name) {
				return normalizeTunnelResponse(tunnel);
			}
		}

		return null;
	});

	if (!tunnel) {
		throw new UserError(
			`No Cloudflare Tunnel named "${name}" was found in this account. Use "wrangler tunnel list" to see available tunnels.`,
			{ telemetryMessage: "tunnel resolve named missing tunnel" }
		);
	}

	const tunnelId = tunnel.id;
	if (!tunnelId) {
		throw new FatalError(
			`Tunnel "${name}" was found but has no ID. This is unexpected.`,
			{ telemetryMessage: "tunnel resolve named missing tunnel id" }
		);
	}

	const configuration = await withTunnelErrorHandling(() =>
		sdk.zeroTrust.tunnels.cloudflared.configurations.get(tunnelId, {
			account_id: accountId,
		})
	);
	const hostnames = getMatchingIngressHostnames(configuration.config?.ingress ?? [], origin.port);
	if (hostnames.length === 0) {
		throw new UserError(
			createMissingIngressMessage(name, origin.port, configuration.config?.ingress ?? []),
			{ telemetryMessage: "tunnel resolve named ingress mismatch" }
		);
	}

	const token = await getTunnelToken(sdk, accountId, tunnelId);

	return { hostnames, token };
}

/**
	 * Return ingress hostnames whose configured service targets the given local port.
	 */
function getMatchingIngressHostnames(
	ingressConfig: CloudflareSDK.ZeroTrust.Tunnels.Cloudflared.Configurations.ConfigurationGetResponse.Config.Ingress[],
	port: string
): string[] {
	const hostnames = new Set<string>();
	for (const ingress of ingressConfig) {
		if (
			ingress.hostname &&
			getTunnelServicePort(ingress.service) === port
		) {
			hostnames.add(ingress.hostname);
		}
	}

	return [...hostnames];
}

/**
	 * Extract the destination port from a tunnel ingress service URL.
	 * Falls back to the default port for HTTP and HTTPS services.
	 */
function getTunnelServicePort(service: string): string | undefined {
	try {
		const url = new URL(service);
		if (url.port) {
			return url.port;
		}

		switch (url.protocol) {
			case "http:":
				return "80";
			case "https:":
				return "443";
			default:
				return undefined;
		}
	} catch {
		return undefined;
	}
}

function createMissingIngressMessage(
	name: string,
	port: string,
	ingress: CloudflareSDK.ZeroTrust.Tunnels.Cloudflared.Configurations.ConfigurationGetResponse.Config.Ingress[]
): string {
	const ingressMappings = ingress.length
		? ingress
				.map(({ hostname, service }) => `  - ${hostname ?? "(no hostname)"} -> ${service}`)
				.join("\n")
		: "  (no ingress rules found)";

	return [
		`No ingress rules in tunnel "${name}" route to local port ${port}.`,
		"",
		"Resolved ingress mappings:",
		ingressMappings,
	].join("\n");
}

/**
 * Normalize tunnel response from SDK to consistent format.
 * The SDK returns a union type (CloudflareTunnel | TunnelWARPConnectorTunnel)
 * but both share the same shape — cast to CloudflareTunnel.
 */
function normalizeTunnelResponse(response: unknown): CloudflareTunnel {
	return response as CloudflareTunnel;
}

/**
 * Tunnel ID regex pattern.
 * Accepts any UUID format (not restricted to v4) since tunnel IDs
 * are not guaranteed to be strictly UUID v4.
 */
const TUNNEL_ID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string looks like a tunnel ID (UUID format).
 */
function isTunnelId(input: string): boolean {
	return TUNNEL_ID_REGEX.test(input);
}

/**
 * Resolve a tunnel name or ID to a tunnel ID.
 *
 * If the input is already a UUID, return it directly.
 * Otherwise, look up the tunnel by name via the API.
 *
 * This matches cloudflared's behavior in findID().
 */
export async function resolveTunnelId(
	sdk: Cloudflare,
	accountId: string,
	input: string
): Promise<string> {
	// If it's already a UUID, return it directly
	if (isTunnelId(input)) {
		return input;
	}

	// Look up tunnel by name using the SDK list filter.
	const tunnels = await withTunnelErrorHandling(async () => {
		const results: CloudflareTunnel[] = [];
		for await (const tunnel of sdk.zeroTrust.tunnels.cloudflared.list({
			account_id: accountId,
			name: input,
			is_deleted: false,
		})) {
			results.push(normalizeTunnelResponse(tunnel));
		}
		return results;
	});

	if (tunnels.length === 0) {
		throw new UserError(
			`"${input}" is neither the ID nor the name of any of your tunnels`,
			{ telemetryMessage: "tunnel resolve missing tunnel" }
		);
	}

	if (tunnels.length > 1) {
		throw new UserError(
			`Found multiple tunnels named "${input}". Please use the tunnel ID instead.`,
			{ telemetryMessage: "tunnel resolve multiple tunnels" }
		);
	}

	const tunnelId = tunnels[0].id;
	if (!tunnelId) {
		throw new UserError(
			`Tunnel "${input}" was found but has no ID. This is unexpected — please try again or use the tunnel ID directly.`,
			{ telemetryMessage: "tunnel resolve missing tunnel id" }
		);
	}
	return tunnelId;
}
