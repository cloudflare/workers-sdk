import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { startTunnel } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { logger } from "../logger";
import { resolveNamedTunnel } from "./client";
import type { DevEnv } from "../api";
import type { StartDevOptions } from "../dev";
import type { Tunnel } from "@cloudflare/workers-utils";

export interface TunnelManager {
	getTunnel: () => Tunnel | undefined;
	isOpen: () => boolean;
	start: () => Promise<void>;
	stop: () => Promise<void>;
}

export function createTunnelManager(
	primaryDevEnv: DevEnv,
	args: StartDevOptions
): TunnelManager {
	let tunnel: Tunnel | undefined;

	function getCurrentTunnelConfig() {
		return primaryDevEnv.config.latestConfig?.dev?.tunnel;
	}

	function getTunnelOrigin() {
		const config = primaryDevEnv.config.latestConfig;
		const protocol = config?.dev?.server?.secure ? "https" : "http";
		const hostname = config?.dev?.server?.hostname ?? "localhost";
		const port = config?.dev?.server?.port ?? 8787;

		return new URL(`${protocol}://${formatHostname(hostname)}:${port}`);
	}

	async function syncTunnelState(enabled: boolean) {
		const latestDevConfig = primaryDevEnv.config.latestConfig?.dev;

		if (
			!latestDevConfig?.tunnel ||
			latestDevConfig.tunnel.enabled === enabled
		) {
			return;
		}

		await primaryDevEnv.config.patch({
			dev: {
				...latestDevConfig,
				tunnel: {
					...latestDevConfig.tunnel,
					enabled,
				},
			},
		});
	}

	function logTunnelDetails(
		result: Awaited<ReturnType<Tunnel["ready"]>>,
		namedTunnel:
			| {
					hostnames: string[];
					token: string;
			  }
			| undefined
	) {
		const publicUrls =
			result.mode === "quick"
				? [result.publicUrl.toString()]
				: namedTunnel
					? namedTunnel.hostnames.map((hostname) => `https://${hostname}`)
					: [];

		if (publicUrls.length === 1) {
			logger.log(
				`⬣ Sharing via Cloudflare Tunnel: ${chalk.green(publicUrls[0])}`
			);
		} else if (publicUrls.length > 1) {
			logger.log(
				"⬣ Sharing via Cloudflare Tunnel:\n" +
					publicUrls.map((url) => `   ${chalk.green(url)}`).join("\n")
			);
		}
	}

	async function start() {
		if (tunnel) {
			return;
		}

		logger.log(dim("⎔ Starting tunnel (usually takes a few seconds)..."));

		const origin = getTunnelOrigin();
		const tunnelConfig = getCurrentTunnelConfig();
		const isQuickTunnel = tunnelConfig?.name === undefined;

		logger.warn(
			(isQuickTunnel
				? chalk.dim("Once connected, this tunnel will be ") +
					"publicly accessible"
				: chalk.dim(
						"Once connected, this hostname may be reachable from the internet, depending on your Cloudflare Access configuration"
					)) +
				chalk.dim(". Anyone who can reach it can:\n") +
				chalk.dim(
					"- Call ungated endpoints\n" +
						"- Trigger logic that uses remote bindings\n" +
						"- Reach internal services if your Worker proxies requests\n" +
						"\n" +
						(isQuickTunnel
							? "Consider using a named tunnel with Cloudflare Access to restrict access.\n"
							: "Consider using Cloudflare Access to restrict access.\n" +
								"\n" +
								"Press [t] again to close the tunnel.")
				)
		);

		const namedTunnel =
			tunnelConfig?.name !== undefined
				? await resolveNamedTunnel(tunnelConfig.name, origin, {
						accountId: args.accountId,
						complianceRegion:
							primaryDevEnv.config.latestConfig?.complianceRegion,
					})
				: undefined;

		const nextTunnel = startTunnel({
			origin,
			token: namedTunnel?.token,
			extendHint: "Press [a] to extend by 1 hour.",
			logger,
		});

		tunnel = nextTunnel;

		try {
			const result = await nextTunnel.ready();
			if (tunnel !== nextTunnel) {
				return;
			}

			await syncTunnelState(true);
			logTunnelDetails(result, namedTunnel);
		} catch (error) {
			if (tunnel === nextTunnel) {
				tunnel = undefined;
				await syncTunnelState(false);
				throw error;
			}
		}
	}

	async function stop() {
		if (!tunnel) {
			return;
		}

		logger.log(dim("⎔ Closing tunnel..."));
		tunnel.dispose();
		tunnel = undefined;
		await syncTunnelState(false);
		logger.log("⬣ Tunnel closed");
	}

	return {
		getTunnel: () => tunnel,
		isOpen: () => tunnel !== undefined,
		start,
		stop,
	};
}

export function formatHostname(hostname: string): string {
	if (hostname === "0.0.0.0" || hostname === "::" || hostname === "*") {
		return "localhost";
	}

	return hostname.includes(":") ? `[${hostname}]` : hostname;
}
