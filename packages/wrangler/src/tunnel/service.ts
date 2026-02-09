import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getTunnelToken, resolveTunnelId } from "./client";
import { getCloudflaredPath } from "./cloudflared";
import { decodeTunnelTokenToCredentialsFile } from "./credentials";

export const tunnelServiceNamespace = createNamespace({
	metadata: {
		description: "Manage cloudflared as a system service",
		status: "stable",
		owner: "Product: Tunnels",
	},
});

export const tunnelServiceInstallCommand = createCommand({
	metadata: {
		description: "Install cloudflared as a system service for a tunnel",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The tunnel name or UUID",
		},
		overwrite: {
			type: "boolean",
			default: false,
			description:
				"Overwrite existing service config/credentials files when installing on Linux",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);
		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);

		logger.log(`Installing cloudflared as a system service for tunnel "${args.tunnel}"`);

		// Get cloudflared binary path
		const cloudflaredPath = await getCloudflaredPath();

		// Fetch token and use it for service install.
		const token = await getTunnelToken(sdk, accountId, tunnelId);
		if (!token) {
			throw new UserError(
				`Failed to get tunnel token for "${args.tunnel}".\n\n` +
					`The API returned an empty token. Please ensure the tunnel exists and is properly configured.`
			);
		}

		if (process.platform === "linux") {
			// cloudflared's Linux service install requires a config file containing:
			// tunnel: <uuid>
			// credentials-file: <path>
			// It will then install a systemd/sysv service that runs `cloudflared --config /etc/cloudflared/config.yml tunnel run`.
			const configDir = "/etc/cloudflared";
			const configPath = path.join(configDir, "config.yml");
			const credentialsPath = path.join(configDir, `${tunnelId}.json`);

			if (typeof process.geteuid === "function" && process.geteuid() !== 0) {
				throw new UserError(
					`Installing a system service on Linux requires root privileges.\n\n` +
						`Try running:\n` +
						`  sudo wrangler tunnel service install ${args.tunnel}`
				);
			}

			fs.mkdirSync(configDir, { recursive: true });

			if (!args.overwrite) {
				if (fs.existsSync(configPath)) {
					throw new UserError(
						`${configPath} already exists. Use --overwrite to replace it.`
					);
				}
				if (fs.existsSync(credentialsPath)) {
					throw new UserError(
						`${credentialsPath} already exists. Use --overwrite to replace it.`
					);
				}
			}

			const credentials = decodeTunnelTokenToCredentialsFile(token);
			fs.writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o400 });
			fs.writeFileSync(
				configPath,
				`tunnel: ${tunnelId}\ncredentials-file: ${credentialsPath}\n`,
				{ mode: 0o644 }
			);

			try {
				execFileSync(
					cloudflaredPath,
					["--config", configPath, "service", "install"],
					{ stdio: "inherit" }
				);
			} catch (e) {
				const error = e as { status?: number };
				if (error.status === 1) {
					throw new UserError(
						`Failed to install cloudflared service.\n\n` +
							`This might be because:\n` +
							`  - The service is already installed\n` +
							`  - You need administrator/root privileges\n` +
							`  - There's a configuration conflict`
					);
				}
				throw e;
			}
		} else {
			// On macOS and Windows, cloudflared service install accepts a tunnel token as a positional arg
			// and installs a service that runs: `cloudflared tunnel run --token <token>`.
			try {
				execFileSync(cloudflaredPath, ["service", "install", token], {
					stdio: "inherit",
				});
			} catch (e) {
				const error = e as { status?: number };
				if (error.status === 1) {
					throw new UserError(
						`Failed to install cloudflared service.\n\n` +
							`This might be because:\n` +
							`  - The service is already installed\n` +
							`  - You need administrator/root privileges\n` +
							`  - There's a configuration conflict\n\n` +
							`Try running as Administrator/root.`
					);
				}
				throw e;
			}
		}

		metrics.sendMetricsEvent("tunnel service install", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`\nService installed successfully.`);
		logger.log(`\nThe tunnel will now start automatically on system boot.`);
		logger.log(`\nTo uninstall the service, run:`);
		logger.log(`   wrangler tunnel service uninstall`);
	},
});

export const tunnelServiceUninstallCommand = createCommand({
	metadata: {
		description: "Uninstall cloudflared system service",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {},
	async handler(args, { config, logger }) {
		logger.log(`Uninstalling cloudflared system service...`);

		// Get cloudflared binary path
		const cloudflaredPath = await getCloudflaredPath();

		// Run cloudflared service uninstall
		try {
			execFileSync(cloudflaredPath, ["service", "uninstall"], {
				stdio: "inherit",
			});
		} catch (e) {
			const error = e as { status?: number };
			if (error.status === 1) {
				throw new UserError(
					`Failed to uninstall cloudflared service.\n\n` +
						`This might be because:\n` +
						`  - No service is currently installed\n` +
						`  - You need administrator/root privileges\n\n` +
						`Try running with sudo (on macOS/Linux) or as Administrator (on Windows).`
				);
			}
			throw e;
		}

		metrics.sendMetricsEvent("tunnel service uninstall", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`\nService uninstalled successfully.`);
	},
});
