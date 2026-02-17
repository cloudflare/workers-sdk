import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { spawnCloudflared } from "./cloudflared";

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
			description: "Log level for cloudflared",
		},
	},
	positionalArgs: ["url"],
	async handler(args, { config, logger }) {
		logger.log(`Starting Quick Tunnel (https://try.cloudflare.com)`);
		logger.log(`Local URL: ${args.url}`);

		metrics.sendMetricsEvent("quick-start tunnel", {
			sendMetrics: config.send_metrics,
		});

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
		const cloudflared = await spawnCloudflared(cloudflaredArgs);

		// Track if we've already started shutting down
		let isShuttingDown = false;

		// Handle process spawn error
		cloudflared.on("error", (error) => {
			if (isShuttingDown) {
				return;
			}

			logger.error(`Failed to run cloudflared: ${error.message}`);

			if (error.message.includes("ENOENT")) {
				logger.error(
					`\nThe cloudflared binary could not be executed.\n` +
						`This might be a permissions issue or the binary is corrupted.\n\n` +
						`Try removing the cache and running again:\n` +
						`  rm -rf ~/.wrangler/cloudflared\n` +
						`  wrangler tunnel quick-start ${args.url}`
				);
			}

			process.exit(1);
		});

		// Handle process exit
		cloudflared.on("exit", (code, signal) => {
			if (isShuttingDown) {
				// Expected shutdown
				logger.log("Tunnel stopped.");
				process.exit(0);
			}

			if (signal) {
				logger.log(`\ncloudflared terminated by signal: ${signal}`);
				process.exit(0);
			}

			if (code !== 0 && code !== null) {
				logger.error(`\ncloudflared exited with code ${code}`);

				// Provide helpful error messages for common exit codes
				if (code === 1) {
					logger.error(
						`\nThis might indicate:\n` +
							`  - The local URL "${args.url}" is not reachable\n` +
							`  - Network connectivity issues\n` +
							`  - Port already in use\n\n` +
							`Make sure your local service is running at ${args.url}\n` +
							`Try running with --log-level debug for more information.`
					);
				}

				process.exit(code);
			}
		});

		// Handle stderr for error detection
		if (cloudflared.stderr) {
			cloudflared.stderr.on("data", (data) => {
				const output = data.toString();
				process.stderr.write(output);
			});
		}

		// Handle SIGINT to gracefully shut down
		const shutdownHandler = () => {
			if (isShuttingDown) {
				return;
			}
			isShuttingDown = true;

			logger.log("\n\nShutting down tunnel...");

			// Give cloudflared time to clean up
			cloudflared.kill("SIGTERM");

			// Force kill after timeout
			setTimeout(() => {
				if (!cloudflared.killed) {
					logger.debug("Force killing cloudflared...");
					cloudflared.kill("SIGKILL");
				}
			}, 5000);
		};

		process.on("SIGINT", shutdownHandler);
		process.on("SIGTERM", shutdownHandler);
	},
});
