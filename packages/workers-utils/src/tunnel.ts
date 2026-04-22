import { logger } from "../logger";
import { spawnCloudflared } from "../tunnel/cloudflared";
import type { ChildProcess } from "node:child_process";

/**
 * Quick tunnels typically start in 5-15s, but we allow up to 30s for slow networks.
 */
const TUNNEL_STARTUP_TIMEOUT_MS = 30_000;
const TUNNEL_FORCE_KILL_TIMEOUT_MS = 5_000;

/**
 * cloudflared logs the quick tunnel URL to stderr.
 */
const QUICK_TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export interface TunnelReadyResult {
	publicUrl: URL;
}

export interface TunnelController {
	ready: () => Promise<TunnelReadyResult>;
	dispose: () => Promise<void>;
}

export interface StartTunnelOptions {
	origin: URL;
	timeoutMs?: number;
}

/**
 * Start a Cloudflare Quick Tunnel for a local dev origin.
 *
 * Spawns `cloudflared tunnel --url <origin>` and waits for the public URL
 * to appear in its stderr output. Returns a controller with a `ready()`
 * promise that resolves once the tunnel URL is available, and a `dispose()`
 * function to stop the tunnel.
 */
export function startTunnel(options: StartTunnelOptions): TunnelController {
	let disposed = false;

	const timeoutMs = options.timeoutMs ?? TUNNEL_STARTUP_TIMEOUT_MS;
	const cloudflaredArgs = [
		"tunnel",
		"--no-autoupdate",
		"--url",
		options.origin.href,
	];

	const cloudflaredPromise = spawnCloudflared(cloudflaredArgs, {
		stdio: "pipe",
		skipVersionCheck: true,
	}).then((process) => {
		if (disposed) {
			terminateCloudflared(process);
		}

		return process;
	});

	const readyPromise = cloudflaredPromise.then((process) =>
		waitForQuickTunnelReady(process, timeoutMs)
	);

	return {
		ready: () => readyPromise,
		dispose: async () => {
			disposed = true;
			const process = await cloudflaredPromise.catch(() => undefined);
			if (process) {
				terminateCloudflared(process);
			}
		},
	};
}

function terminateCloudflared(cloudflared: ChildProcess) {
	if (cloudflared.killed) {
		return;
	}

	cloudflared.kill("SIGTERM");

	const forceKillTimer = setTimeout(() => {
		if (!cloudflared.killed) {
			cloudflared.kill("SIGKILL");
		}
	}, TUNNEL_FORCE_KILL_TIMEOUT_MS);
	forceKillTimer.unref();
}

function waitForQuickTunnelReady(
	cloudflared: ChildProcess,
	timeoutMs: number
): Promise<TunnelReadyResult> {
	return new Promise<TunnelReadyResult>((resolve, reject) => {
		let resolved = false;
		let stderrOutput = "";

		const timeoutId = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				terminateCloudflared(cloudflared);
				reject(
					new Error(
						`Timed out waiting for cloudflared to start (${timeoutMs / 1_000}s).\n` +
							`cloudflared output:\n${stderrOutput || "(no output)"}\n\n` +
							`This may indicate network issues. Try again or check your connection.`
					)
				);
			}
		}, timeoutMs);
		timeoutId.unref();

		if (cloudflared.stderr) {
			cloudflared.stderr.on("data", (data: Buffer) => {
				const chunk = data.toString();
				stderrOutput += chunk;
				logger.debug("[cloudflared]", chunk.trimEnd());

				const match = QUICK_TUNNEL_URL_REGEX.exec(stderrOutput);
				if (match && !resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					resolve({ publicUrl: new URL(match[0]) });
				}
			});
		}

		cloudflared.on("error", (error) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeoutId);
				reject(new Error(`Failed to start cloudflared: ${error.message}`));
			}
		});

		cloudflared.on("exit", (code, signal) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeoutId);

				const reason = signal
					? `terminated by signal ${signal}`
					: `exited with code ${code}`;

				reject(
					new Error(
						`cloudflared ${reason} before the tunnel was ready.\n` +
							`cloudflared output:\n${stderrOutput || "(no output)"}\n\n` +
							`Make sure your local dev server is running and reachable.`
					)
				);
			}
		});
	});
}
