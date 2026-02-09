import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getTunnelToken, resolveTunnelId } from "./client";
import { CLOUDFLARED_VERSION, spawnCloudflared } from "./cloudflared";

export const tunnelRunCommand = createCommand({
	metadata: {
		description: "Run a Cloudflare Tunnel using cloudflared",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			description:
				"The name or UUID of the tunnel to run (required unless --token/--token-file is provided)",
		},
		token: {
			type: "string",
			description:
				"The tunnel token to use (skips API auth, useful for running on remote machines)",
		},
		tokenFile: {
			type: "string",
			alias: "token-file",
			description: "Read tunnel token from a file",
		},
		url: {
			type: "string",
			description: "The local URL to expose (e.g., http://localhost:3000)",
		},
		"log-level": {
			type: "string",
			default: "info",
			choices: ["debug", "info", "warn", "error", "fatal"] as const,
			description: "Log level for cloudflared",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		let tokenStr = args.token;
		if (!tokenStr && args.tokenFile) {
			try {
				tokenStr = fs.readFileSync(args.tokenFile, "utf8").trim();
			} catch (e) {
				throw new UserError(
					`Failed to read token file "${args.tokenFile}".\n\n` +
						`${e instanceof Error ? e.message : String(e)}`
				);
			}
		}

		let tunnelId: string | undefined;
		if (!tokenStr) {
			if (!args.tunnel) {
				throw new UserError(
					`Either a tunnel name/UUID or --token/--token-file must be provided.\n\n` +
						`Usage:\n` +
						`  wrangler tunnel run <tunnel>                 # Fetch token via API\n` +
						`  wrangler tunnel run --token <token>          # Use provided token\n` +
						`  wrangler tunnel run --token-file <file>      # Read token from file`
				);
			}
			const accountId = await requireAuth(config);
			tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);

			logger.log(`Running tunnel "${args.tunnel}"`);
			logger.log(`Fetching tunnel credentials...`);
			try {
				tokenStr = await getTunnelToken(sdk, accountId, tunnelId);
			} catch (e) {
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

		metrics.sendMetricsEvent("run tunnel", {
			sendMetrics: config.send_metrics,
		});

		// Write token to a temporary file to avoid leaking it via process args.
		const tokenDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wrangler-cloudflared-token-")
		);
		const tokenFilePath = path.join(tokenDir, "token");
		fs.writeFileSync(tokenFilePath, tokenStr, { mode: 0o600 });
		const cleanupTokenFile = () => {
			try {
				fs.rmSync(tokenDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
		};
		process.on("exit", cleanupTokenFile);

		// Build cloudflared command
		const cloudflaredArgs = [
			"tunnel",
			"--no-autoupdate",
			"--loglevel",
			args.logLevel || "info",
			"run",
			"--token-file",
			tokenFilePath,
		];

		// Add URL if provided
		if (args.url) {
			cloudflaredArgs.push("--url", args.url);
		}

		logger.log(`\nStarting cloudflared ${CLOUDFLARED_VERSION}...`);
		if (tunnelId) {
			logger.log(`   Tunnel ID: ${tunnelId}`);
		}
		if (args.url) {
			logger.log(`   Local URL: ${args.url}`);
		}
		logger.log(`\nPress Ctrl+C to stop the tunnel.\n`);

		// Spawn cloudflared process with automatic binary management
		const cloudflared = await spawnCloudflared(cloudflaredArgs);

		// Track if we've already started shutting down
		let isShuttingDown = false;

		// Handle process spawn error (e.g., binary not found after download)
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
						`  wrangler tunnel run ${tunnelId || "--token <token>"}`
				);
			}

			process.exit(1);
		});

		// Handle process exit
		cloudflared.on("exit", (code, signal) => {
			cleanupTokenFile();
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
							`  - Invalid tunnel configuration\n` +
							`  - Network connectivity issues\n` +
							`  - Authentication problems\n\n` +
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
				// Log stderr but don't treat all stderr as errors
				// cloudflared outputs info to stderr
				process.stderr.write(output);
			});
		}

		// Handle SIGINT to gracefully shut down
		const shutdownHandler = () => {
			if (isShuttingDown) {
				return;
			}
			isShuttingDown = true;
			cleanupTokenFile();

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
