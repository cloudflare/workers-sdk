import { join } from "node:path";
import {
	getGlobalWranglerConfigPath,
	spawnCloudflared,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { requireAuth } from "../user";
import { getTunnelToken, resolveTunnelId } from "./client";

export const tunnelRunCommand = createCommand({
	metadata: {
		description: "Run a Cloudflare Tunnel using cloudflared",
		status: "experimental",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			description:
				"The name or UUID of the tunnel to run (required unless --token is provided)",
		},
		token: {
			type: "string",
			description:
				"The tunnel token to use (skips API auth, useful for running on remote machines)",
		},
		"log-level": {
			type: "string",
			default: "info",
			choices: ["debug", "info", "warn", "error", "fatal"] as const,
			description:
				"Log level for cloudflared (does not affect Wrangler logs, which are controlled by WRANGLER_LOG)",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		let tokenStr = args.token;

		let tunnelId: string | undefined;
		if (!tokenStr) {
			if (!args.tunnel) {
				throw new UserError(
					`Either a tunnel name/UUID or --token must be provided.\n\n` +
						`Usage:\n` +
						`  wrangler tunnel run <tunnel>            # Fetch token via API\n` +
						`  wrangler tunnel run --token <token>     # Use provided token`
				);
			}
			const accountId = await requireAuth(config);
			tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);

			logger.log(`Running tunnel "${args.tunnel}"`);
			logger.log(`Fetching tunnel credentials...`);
			try {
				tokenStr = await getTunnelToken(sdk, accountId, tunnelId);
			} catch (e) {
				// Re-throw UserErrors (e.g. permission errors) as-is so the
				// detailed guidance from withTunnelErrorHandling isn't lost.
				if (e instanceof UserError) {
					throw e;
				}
				throw new UserError(
					`Failed to get tunnel token for "${args.tunnel}".\n\n` +
						`This could mean:\n` +
						`  - The tunnel doesn't exist\n` +
						`  - You don't have permission to access this tunnel\n` +
						`  - The tunnel has been deleted\n\n` +
						`Use "wrangler tunnel list" to see available tunnels.\n\n` +
						`Original error: ${e instanceof Error ? e.message : String(e)}`
				);
			}
			if (!tokenStr) {
				throw new UserError(
					`Failed to get tunnel token for "${args.tunnel}".\n\n` +
						`The API returned an empty token. Please ensure the tunnel exists and is properly configured.`
				);
			}
		} else {
			logger.log(`Running tunnel with provided token`);
		}

		// Build cloudflared command.
		// The token is passed via TUNNEL_TOKEN env var rather than CLI args
		// to avoid leaking it in process listings (ps) and to maintain
		// compatibility with all cloudflared versions.
		const cloudflaredArgs = [
			"tunnel",
			"--no-autoupdate",
			"--loglevel",
			args.logLevel || "info",
			"run",
		];

		logger.log(`\nStarting cloudflared...`);
		if (tunnelId) {
			logger.log(`   Tunnel ID: ${tunnelId}`);
		}
		logger.log(`\nPress Ctrl+C to stop the tunnel.\n`);

		// Spawn cloudflared process with automatic binary management.
		// Token is passed via env var to avoid leaking in `ps` output.
		const cloudflared = await spawnCloudflared(cloudflaredArgs, {
			env: { TUNNEL_TOKEN: tokenStr },
			confirmDownload: (message) => confirm(message),
			logger,
		});

		// Track if we've already started shutting down
		let isShuttingDown = false;

		// Handle SIGINT/SIGTERM to gracefully shut down
		const shutdownHandler = () => {
			if (isShuttingDown) {
				return;
			}
			isShuttingDown = true;

			logger.log("\n\nShutting down tunnel...");

			// Give cloudflared time to clean up
			cloudflared.kill("SIGTERM");

			// Force kill after timeout
			const forceKillTimer = setTimeout(() => {
				if (!cloudflared.killed) {
					logger.debug("Force killing cloudflared...");
					cloudflared.kill("SIGKILL");
				}
			}, 5000);
			forceKillTimer.unref();
		};

		process.on("SIGINT", shutdownHandler);
		process.on("SIGTERM", shutdownHandler);

		const cleanup = () => {
			process.removeListener("SIGINT", shutdownHandler);
			process.removeListener("SIGTERM", shutdownHandler);
		};

		// Handle stderr for cloudflared output
		if (cloudflared.stderr) {
			cloudflared.stderr.on("data", (data: Buffer) => {
				// cloudflared outputs info to stderr
				process.stderr.write(data.toString());
			});
		}

		// Return a promise that resolves/rejects based on the child process lifecycle.
		// This avoids calling process.exit() and lets the command infrastructure handle exit.
		return new Promise<void>((resolve, reject) => {
			cloudflared.on("error", (error) => {
				cleanup();
				if (isShuttingDown) {
					resolve();
					return;
				}

				let message = `Failed to run cloudflared: ${error.message}`;

				if (error.message.includes("ENOENT")) {
					message +=
						`\n\nThe cloudflared binary could not be executed.\n` +
						`This might be a permissions issue or the binary is corrupted.\n\n` +
						`Try removing the cache and running again:\n` +
						`  rm -rf ${join(getGlobalWranglerConfigPath(), "cloudflared")}\n` +
						`  wrangler tunnel run ${tunnelId || "--token <token>"}`;
				}

				reject(new UserError(message));
			});

			cloudflared.on("exit", (code, signal) => {
				cleanup();
				if (isShuttingDown) {
					logger.log("Tunnel stopped.");
					resolve();
					return;
				}

				if (signal) {
					logger.log(`\ncloudflared terminated by signal: ${signal}`);
					resolve();
					return;
				}

				if (code !== 0 && code !== null) {
					let message = `cloudflared exited with code ${code}`;

					if (code === 1) {
						message +=
							`\n\nThis might indicate:\n` +
							`  - Invalid tunnel configuration\n` +
							`  - Network connectivity issues\n` +
							`  - Authentication problems\n\n` +
							`Try running with --log-level debug for more information.`;
					}

					reject(new UserError(message));
					return;
				}

				resolve();
			});
		});
	},
});
