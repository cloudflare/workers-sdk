import { spawnCloudflared } from "./cloudflared";
import { UserError } from "./errors";
import type { Logger } from "./cloudflared";
import type { ChildProcess } from "node:child_process";

/**
 * Quick tunnels typically start in 5-15s, but we allow up to 30s for slow networks.
 */
const TUNNEL_STARTUP_TIMEOUT_MS = 30_000;
const TUNNEL_FORCE_KILL_TIMEOUT_MS = 5_000;
const DEFAULT_TUNNEL_EXPIRY_MS = 60 * 60 * 1_000;
const DEFAULT_TUNNEL_EXTENSION_MS = 60 * 60 * 1_000;
const DEFAULT_TUNNEL_MAX_REMAINING_MS = 3 * 60 * 60 * 1_000;
const DEFAULT_TUNNEL_REMINDER_INTERVAL_MS = 10 * 60 * 1_000;

/**
 * cloudflared logs the quick tunnel URL to stderr.
 */
const QUICK_TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export interface TunnelResult {
	publicUrl: URL;
}

export interface Tunnel {
	ready: () => Promise<TunnelResult>;
	dispose: () => Promise<void>;
	extendExpiry: (ms?: number) => void;
}

export interface TunnelOptions {
	origin: URL;
	timeoutMs?: number;
	expiryMs?: number;
	reminderIntervalMs?: number;
	extendHint?: string;
	logger?: Logger;
}

/**
 * Start a Cloudflare Quick Tunnel for a local dev origin.
 *
 * Spawns `cloudflared tunnel --url <origin>` and waits for the public URL
 * to appear in its stderr output. Returns a controller with a `ready()`
 * promise that resolves once the tunnel URL is available, and a `dispose()`
 * function to stop the tunnel.
 */
export function startTunnel(options: TunnelOptions): Tunnel {
	let disposed = false;
	let reminderInterval: ReturnType<typeof setInterval> | undefined;
	let expiryTimeout: ReturnType<typeof setTimeout> | undefined;
	let expiresAt = 0;

	const logger = options.logger;
	const timeoutMs = options.timeoutMs ?? TUNNEL_STARTUP_TIMEOUT_MS;
	const reminderIntervalMs =
		options.reminderIntervalMs ?? DEFAULT_TUNNEL_REMINDER_INTERVAL_MS;
	const defaultExpiryMs = options.expiryMs ?? DEFAULT_TUNNEL_EXPIRY_MS;
	const timeFormatter = new Intl.DateTimeFormat(undefined, {
		timeStyle: "short",
	});
	const cloudflaredArgs = [
		"tunnel",
		"--no-autoupdate",
		"--url",
		options.origin.href,
	];

	const cloudflaredPromise = spawnCloudflared(cloudflaredArgs, {
		stdio: "pipe",
		skipVersionCheck: true,
		logger,
	}).then((process) => {
		if (disposed) {
			terminateCloudflared(process);
		}

		return process;
	});

	const readyPromise = cloudflaredPromise
		.then((process) =>
			waitForQuickTunnelReady(process, timeoutMs, {
				logger,
				origin: options.origin,
			})
		)
		.then((result) => {
			expiresAt = Date.now() + defaultExpiryMs;

			scheduleExpiryTimeout();
			scheduleReminder(result.publicUrl.origin);

			return result;
		});

	async function disposeTunnel() {
		disposed = true;
		clearTunnelTimers();
		const process = await cloudflaredPromise.catch(() => undefined);
		if (process) {
			terminateCloudflared(process);
		}
	}

	function clearTunnelTimers() {
		if (expiryTimeout) {
			clearTimeout(expiryTimeout);
			expiryTimeout = undefined;
		}

		if (reminderInterval) {
			clearInterval(reminderInterval);
			reminderInterval = undefined;
		}
	}

	function scheduleReminder(publicURL: string) {
		if (reminderIntervalMs > 0) {
			reminderInterval = setInterval(() => {
				if (disposed) {
					return;
				}

				const remainingMs = expiresAt - Date.now();
				if (remainingMs <= 0) {
					return;
				}

				logger?.log(
					`The tunnel is still open at ${publicURL}. It expires in ${formatTunnelDuration(remainingMs)}. ${options.extendHint ?? ""}`
				);
			}, reminderIntervalMs);
			reminderInterval.unref?.();
		}
	}

	function scheduleExpiryTimeout() {
		if (disposed) {
			return;
		}

		if (expiryTimeout) {
			clearTimeout(expiryTimeout);
		}

		expiryTimeout = setTimeout(
			() => {
				if (disposed) {
					return;
				}

				logger?.log("Tunnel expired. Closing tunnel.");
				void disposeTunnel();
			},
			Math.max(0, expiresAt - Date.now())
		);
		expiryTimeout.unref();
	}

	function extendExpiry(ms = DEFAULT_TUNNEL_EXTENSION_MS) {
		if (disposed || !expiryTimeout || ms <= 0) {
			return;
		}

		const now = Date.now();
		const previousExpiresAt = expiresAt;
		expiresAt = Math.min(
			now + DEFAULT_TUNNEL_MAX_REMAINING_MS,
			Math.max(expiresAt, now) + ms
		);
		const extendedByMs = expiresAt - previousExpiresAt;

		if (extendedByMs < ms) {
			logger?.log(
				`Tunnel expiry extended to the ${formatTunnelDuration(DEFAULT_TUNNEL_MAX_REMAINING_MS)} limit. It now expires at ${timeFormatter.format(new Date(expiresAt))}.`
			);
			scheduleExpiryTimeout();
			return;
		}

		logger?.log(
			`Tunnel expiry extended by ${formatTunnelDuration(extendedByMs)}. It now expires at ${timeFormatter.format(new Date(expiresAt))}.`
		);
		scheduleExpiryTimeout();
	}

	return {
		ready: () => readyPromise,
		dispose: disposeTunnel,
		extendExpiry,
	};
}

function formatTunnelDuration(durationMs: number) {
	const totalMinutes = Math.max(1, Math.ceil(durationMs / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours === 0) {
		return `${minutes}m`;
	}

	if (minutes === 0) {
		return `${hours}h`;
	}

	return `${hours}h ${minutes}m`;
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
	timeoutMs: number,
	options: { logger?: Logger; origin: URL }
): Promise<TunnelResult> {
	return new Promise<TunnelResult>((resolve, reject) => {
		let resolved = false;
		let stderrOutput = "";
		const logger = options?.logger;
		const origin = options?.origin;
		const timeoutId = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				terminateCloudflared(cloudflared);
				reject(
					createTunnelStartupError(
						`Timed out waiting for cloudflared to start (${timeoutMs / 1_000}s).`,
						stderrOutput,
						origin
					)
				);
			}
		}, timeoutMs);
		timeoutId.unref();

		if (cloudflared.stderr) {
			cloudflared.stderr.on("data", (data: Buffer) => {
				const chunk = data.toString();
				stderrOutput += chunk;
				logger?.debug("[cloudflared]", chunk.trimEnd());

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
					createTunnelStartupError(
						`cloudflared ${reason} before the tunnel was ready.`,
						stderrOutput,
						origin
					)
				);
			}
		});
	});
}

function createTunnelStartupError(
	message: string,
	stderrOutput: string,
	origin: URL
): Error {
	const isQuickTunnelRateLimited = stderrOutput.includes(
		"429 Too Many Requests"
	);
	const errorMessage =
		`${message}\n` +
		`cloudflared output:\n${stderrOutput || "(no output)"}\n\n` +
		`The local dev server started at ${origin.href}.\n` +
		(isQuickTunnelRateLimited
			? "Cloudflare Quick Tunnel creation was rate limited. Try again in a few minutes, or use a named tunnel if you need more reliable access."
			: `Check the cloudflared output above for more details, and verify that ${origin.href} is reachable from this machine if this keeps happening.`);

	if (isQuickTunnelRateLimited) {
		return new UserError(errorMessage);
	}

	return new Error(errorMessage);
}
