import { getRemoteBindingsAuthHook } from "@cloudflare/remote-bindings";
import { resolveNamedTunnel as resolveNamedTunnelWithCredentials } from "@cloudflare/workers-utils";
import { consoleLogger } from "./utils";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Resolves the named tunnel to hostnames whose ingress rules target the
 * current local dev origin and the token needed to start `cloudflared tunnel run`.
 *
 * @param name The name of the tunnel
 * @param origin The local dev origin
 * @param options The account and compliance region to resolve the tunnel in
 * @returns The tunnel hostnames and token
 */
export async function resolveNamedTunnel(
	name: string,
	origin: URL,
	options: {
		accountId: string | undefined;
		complianceRegion: Config["compliance_region"];
	}
): Promise<{ hostnames: string[]; token: string }> {
	const auth = getRemoteBindingsAuthHook(
		undefined,
		options.accountId,
		undefined,
		consoleLogger
	);
	const { accountId, apiToken } =
		typeof auth === "function" ? await auth() : await auth;
	const { version } = (
		await import("../package.json", { with: { type: "json" } })
	).default;

	return resolveNamedTunnelWithCredentials(name, origin, {
		accountId,
		apiToken,
		complianceRegion: options.complianceRegion,
		logger: consoleLogger,
		userAgent: `@cloudflare/vite-plugin/${version}`,
	});
}
