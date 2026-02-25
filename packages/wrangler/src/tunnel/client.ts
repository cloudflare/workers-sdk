import { UserError } from "@cloudflare/workers-utils";
import { Cloudflare as CloudflareSDK } from "cloudflare";
import type Cloudflare from "cloudflare";
import type { CloudflaredCreateResponse } from "cloudflare/resources/zero-trust/tunnels/cloudflared";

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
2. Use the "Edit Cloudflare Tunnel" template, or create a custom token with:
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
			throw new UserError(TUNNEL_PERMISSION_ERROR_MESSAGE);
		}
		if (error instanceof CloudflareSDK.APIError) {
			throw new UserError(error.message, { cause: error });
		}
		throw error;
	}
}

/**
 * Represents a Cloudflare Tunnel resource
 */
export type CloudflareTunnelResource = {
	id: string;
	name: string;
	account_tag?: string;
	status?: "inactive" | "degraded" | "healthy" | "down";
	created_at?: string;
	deleted_at?: string;
	conns_active_at?: string;
	conns_inactive_at?: string;
	tun_type?: "cfd_tunnel";
};

/**
 * Create a new tunnel
 */
export async function createTunnel(
	sdk: Cloudflare,
	accountId: string,
	name: string
): Promise<CloudflareTunnelResource> {
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
): Promise<CloudflareTunnelResource> {
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
): Promise<CloudflareTunnelResource[]> {
	return withTunnelErrorHandling(async () => {
		const tunnels: CloudflareTunnelResource[] = [];
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
 * Normalize tunnel response from SDK to consistent format
 */
function normalizeTunnelResponse(response: unknown): CloudflareTunnelResource {
	const tunnel = response as Record<string, unknown>;
	return {
		id: (tunnel.id as string) || "",
		name: (tunnel.name as string) || "",
		account_tag: tunnel.account_tag as string | undefined,
		status: tunnel.status as CloudflareTunnelResource["status"],
		created_at: tunnel.created_at as string | undefined,
		deleted_at: tunnel.deleted_at as string | undefined,
		conns_active_at: tunnel.conns_active_at as string | undefined,
		conns_inactive_at: tunnel.conns_inactive_at as string | undefined,
		tun_type: tunnel.tun_type as CloudflareTunnelResource["tun_type"],
	};
}

/**
 * General UUID regex pattern for validation.
 * Accepts any UUID version (not restricted to v4) since tunnel IDs
 * are not guaranteed to be strictly UUID v4.
 */
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID
 */
function isUUID(input: string): boolean {
	return UUID_REGEX.test(input);
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
	if (isUUID(input)) {
		return input;
	}

	// Look up tunnel by name using the SDK list filter.
	const tunnels = await withTunnelErrorHandling(async () => {
		const results: CloudflareTunnelResource[] = [];
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
			`"${input}" is neither the ID nor the name of any of your tunnels`
		);
	}

	if (tunnels.length > 1) {
		throw new UserError(
			`Found multiple tunnels named "${input}". Please use the tunnel ID instead.`
		);
	}

	return tunnels[0].id;
}
