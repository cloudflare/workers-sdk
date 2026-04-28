import { join } from "node:path";
import {
	getGlobalWranglerConfigPath,
	spawnCloudflared,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";

/**
 * Quick tunnel command - uses cloudflared to create a temporary tunnel
 * without needing to create it via the API first.
 *
 * Uses the Try Cloudflare / Quick Tunnel feature:
 * https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/do-more-with-tunnels/trycloudflare/
 *
 * Quick tunnels:
 * - Don't require a Cloudflare account or authentication
 * - Are temporary and expire when the process stops
 * - Get a random *.trycloudflare.com subdomain
 * - Include automatic HTTPS and DDoS protection
 * - Are great for quick demos, previews, and testing
 *
 * Learn more at https://try.cloudflare.com/
 */
export const tunnelQuickStartCommand = createCommand({
	metadata: {
		description:
			"Start a free, temporary tunnel without an account (https://try.cloudflare.com)",
		status: "experimental",
		owner: "Product: Tunnels",
	},
	args: {
		url: {
			type: "string",
			demandOption: true,
			description: "The local URL to expose (e.g., http://localhost:3000)",
		},
		"log-level": {
			type: "string",
			default: "info",
			choices: ["debug", "info", "warn", "error", "fatal"] as const,
			description:
				"Log level for cloudflared (does not affect Wrangler logs, which are controlled by WRANGLER_LOG)",
		},
	},
	positionalArgs: ["url"],
	async handler(args, { logger }) {
		logger.log(`Starting Quick Tunnel (https://try.cloudflare.com)`);
		logger.log(`Local URL: ${args.url}`);

		// Build cloudflared command for quick tunnel
		// Using the --url flag without authentication creates a temporary tunnel
		const cloudflaredArgs = [
			"tunnel",
			"--no-autoupdate",
			"--url",
			args.url,
			"--loglevel",
			args.logLevel || "info",
		];

		logger.log(`\nStarting cloudflared...`);
		logger.log(`   No account required - this is a free, temporary tunnel.`);
		logger.log(`   You'll get a random *.trycloudflare.com URL to share.`);
		logger.log(`   The tunnel will stop when you press Ctrl+C.\n`);

		// Spawn cloudflared process with automatic binary management
		const cloudflared = await spawnCloudflared(cloudflaredArgs, {
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
						`  wrangler tunnel quick-start ${args.url}`;
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
							`  - The local URL "${args.url}" is not reachable\n` +
							`  - Network connectivity issues\n` +
							`  - Port already in use\n\n` +
							`Make sure your local service is running at ${args.url}\n` +
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
