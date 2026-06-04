import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { startTunnel } from "@cloudflare/workers-utils";
import chalk from "chalk";
import encodeQR from "qr";
import { formatHostname } from "../dev/start-dev";
import { logger } from "../logger";
import { resolveNamedTunnel } from "./client";
import type { DevEnv } from "../api";
import type { StartDevOptions } from "../dev";
import type { Tunnel } from "@cloudflare/workers-utils";

export class TunnelManager {
	private primaryDevEnv: DevEnv;
	private args: StartDevOptions;
	private tunnel: Tunnel | undefined;

	constructor(primaryDevEnv: DevEnv, args: StartDevOptions) {
		this.primaryDevEnv = primaryDevEnv;
		this.args = args;
	}

	getTunnel(): Tunnel | undefined {
		return this.tunnel;
	}

	isOpen(): boolean {
		return this.tunnel !== undefined;
	}

	async start(shortcutPressed = false): Promise<void> {
		if (this.tunnel) {
			return;
		}

		logger.log(dim("⎔ Starting tunnel (usually takes a few seconds)..."));

		const origin = this.getTunnelOrigin();
		const tunnelConfig = this.getCurrentTunnelConfig();
		const isQuickTunnel = tunnelConfig?.name === undefined;

		logger.warn(
			(isQuickTunnel
				? chalk.dim("Once connected, this tunnel will be ") +
					"publicly accessible"
				: chalk.dim(
						"Once connected, this tunnel may be reachable from the Internet"
					)) +
				chalk.dim(". Anyone who can reach it can:\n") +
				chalk.dim(
					"- Call ungated endpoints\n" +
						"- Trigger logic that uses remote bindings\n" +
						"- Reach internal services if your Worker proxies requests\n" +
						"\n" +
						(isQuickTunnel
							? "Consider using a named tunnel with Cloudflare Access to restrict access.\n"
							: "Consider using Cloudflare Access to restrict access.\n")
				) +
				(shortcutPressed ? "\nPress [t] again to close the tunnel." : "")
		);

		const namedTunnel =
			tunnelConfig?.name !== undefined
				? await resolveNamedTunnel(tunnelConfig.name, origin, {
						accountId: this.args.accountId,
						complianceRegion:
							this.primaryDevEnv.config.latestConfig?.complianceRegion,
					})
				: undefined;

		const nextTunnel = startTunnel({
			origin,
			token: namedTunnel?.token,
			extendHint: "Press [a] to extend by 1 hour.",
			logger,
		});

		this.tunnel = nextTunnel;

		try {
			const result = await nextTunnel.ready();
			if (this.tunnel !== nextTunnel) {
				return;
			}

			await this.syncTunnelState(true);
			this.logTunnelDetails(result, namedTunnel);
		} catch (error) {
			if (this.tunnel === nextTunnel) {
				this.tunnel = undefined;
				await this.syncTunnelState(false);
			}

			throw error;
		}
	}

	async stop(): Promise<void> {
		if (!this.tunnel) {
			return;
		}

		logger.log(dim("⎔ Closing tunnel..."));
		this.tunnel.dispose();
		this.tunnel = undefined;
		await this.syncTunnelState(false);
		logger.log("⬣ Tunnel closed");
	}

	private getCurrentTunnelConfig() {
		return this.primaryDevEnv.config.latestConfig?.dev?.tunnel;
	}

	private getTunnelOrigin() {
		const config = this.primaryDevEnv.config.latestConfig;
		const protocol = config?.dev?.server?.secure ? "https" : "http";
		const hostname = config?.dev?.server?.hostname ?? "localhost";
		const port = config?.dev?.server?.port ?? 8787;

		return new URL(`${protocol}://${formatHostname(hostname)}:${port}`);
	}

	private async syncTunnelState(enabled: boolean) {
		const latestDevConfig = this.primaryDevEnv.config.latestConfig?.dev;

		if (
			!latestDevConfig?.tunnel ||
			latestDevConfig.tunnel.enabled === enabled
		) {
			return;
		}

		await this.primaryDevEnv.config.patch({
			dev: {
				...latestDevConfig,
				tunnel: {
					...latestDevConfig.tunnel,
					enabled,
				},
			},
		});
	}

	private logTunnelDetails(
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
			this.printQrCode(publicUrls[0]);
		} else if (publicUrls.length > 1) {
			logger.log(
				"⬣ Sharing via Cloudflare Tunnel:\n" +
					publicUrls.map((url) => `   ${chalk.green(url)}`).join("\n")
			);
			// Print a QR code for the first URL when multiple are available
			this.printQrCode(publicUrls[0]);
		}
	}

	private printQrCode(url: string): void {
		try {
			const qrCode = encodeQR(url, "ascii", { border: 1 });
			logger.log(`\n${qrCode}`);
		} catch {
			// QR generation is best-effort; don't disrupt the dev session if it fails
		}
	}
}
