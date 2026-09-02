import { fetchResultBase } from "./cfetch";
import { spawnCloudflared } from "./cloudflared";
import { FatalError, UserError } from "./errors";
import type { ApiCredentials } from "./cfetch";
import type { ComplianceConfig } from "./environment-variables/misc-variables";
import type { Logger } from "./logger";
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

const LOCAL_TUNNEL_HOSTNAMES = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"0.0.0.0",
	"::",
]);

interface CloudflareTunnel {
	id?: string;
	name?: string;
}

interface TunnelIngress {
	hostname?: string;
	service: string;
}

interface TunnelConfiguration {
	config?: { ingress?: TunnelIngress[] };
}

export interface QuickTunnelResult {
	mode: "quick";
	publicUrl: URL;
}

export interface NamedTunnelResult {
	mode: "named";
}

export type TunnelResult = QuickTunnelResult | NamedTunnelResult;

export interface Tunnel {
	ready: () => Promise<TunnelResult>;
	isOpen: () => boolean;
	dispose: () => void;
	extendExpiry: (ms?: number) => void;
}

export interface TunnelOptions {
	origin: URL;
	token?: string;
	timeoutMs?: number;
	expiryMs?: number;
	reminderIntervalMs?: number;
	extendHint?: string;
	logger?: Pick<Logger, "debug" | "log" | "warn">;
}

/**
 * Resolves the named tunnel to hostnames whose ingress rules target the current
 * local dev origin and the token needed to start `cloudflared tunnel run`.
 */
export async function resolveNamedTunnel(
	name: string,
	origin: URL,
	options: {
		accountId: string;
		apiToken: ApiCredentials;
		complianceRegion: ComplianceConfig["compliance_region"];
		logger: Logger;
		userAgent: string;
		abortSignal?: AbortSignal;
	}
): Promise<{ hostnames: string[]; token: string }> {
	const {
		accountId,
		apiToken,
		complianceRegion,
		logger,
		userAgent,
		abortSignal,
	} = options;
	const complianceConfig = { compliance_region: complianceRegion };
	const resource = `/accounts/${accountId}/cfd_tunnel`;
	const tunnels = await fetchResultBase<CloudflareTunnel[]>(
		complianceConfig,
		resource,
		undefined,
		userAgent,
		logger,
		new URLSearchParams({ name, is_deleted: "false" }),
		abortSignal,
		apiToken
	);
	const tunnel = tunnels.find((item) => item.name === name);

	if (!tunnel) {
		throw new UserError(
			`No Cloudflare Tunnel named "${name}" was found in this account. Use "wrangler tunnel list" to see available tunnels.`,
			{ telemetryMessage: "tunnel resolve named missing tunnel" }
		);
	}

	const tunnelId = tunnel.id;
	if (!tunnelId) {
		throw new FatalError(
			`Tunnel "${name}" was found but has no ID. This is unexpected.`,
			{ telemetryMessage: "tunnel resolve named missing tunnel id" }
		);
	}

	const configuration = await fetchResultBase<TunnelConfiguration>(
		complianceConfig,
		`${resource}/${tunnelId}/configurations`,
		undefined,
		userAgent,
		logger,
		undefined,
		abortSignal,
		apiToken
	);
	const ingress = configuration.config?.ingress ?? [];
	const hostnames = getMatchingIngressHostnames(origin, ingress);

	if (hostnames.length === 0) {
		throw new UserError(
			createMissingIngressMessage(
				name,
				origin,
				`https://dash.cloudflare.com/${accountId}/tunnels/${tunnelId}`,
				ingress
			),
			{ telemetryMessage: "tunnel resolve named ingress mismatch" }
		);
	}

	const token = await fetchResultBase<string>(
		complianceConfig,
		`${resource}/${tunnelId}/token`,
		undefined,
		userAgent,
		logger,
		undefined,
		abortSignal,
		apiToken
	);

	return { hostnames, token: String(token) };
}
/** Return ingress hostnames whose configured service targets the local origin. */
function getMatchingIngressHostnames(
	origin: URL,
	ingressConfig: TunnelIngress[]
): string[] {
	const hostnames = new Set<string>();
	const originUrl = normalizeURL(origin);

	for (const ingress of ingressConfig) {
		try {
			const serviceUrl = normalizeURL(ingress.service);

			if (ingress.hostname && serviceUrl.toString() === originUrl.toString()) {
				hostnames.add(ingress.hostname);
			}
		} catch {
			// Ignore invalid service URLs in ingress rules.
		}
	}

	return [...hostnames];
}

function normalizeURL(url: URL | string): URL {
	const normalizedUrl = new URL(url);

	if (LOCAL_TUNNEL_HOSTNAMES.has(normalizedUrl.hostname)) {
		normalizedUrl.hostname = "localhost";
	}

	if (!normalizedUrl.port) {
		switch (normalizedUrl.protocol) {
			case "http:":
				normalizedUrl.port = "80";
				break;
			case "https:":
				normalizedUrl.port = "443";
				break;
		}
	}

	return normalizedUrl;
}

function createMissingIngressMessage(
	name: string,
	origin: URL,
	dashboardUrl: string,
	ingress: TunnelIngress[]
): string {
	if (ingress.length === 0) {
		return [
			`Tunnel "${name}" has no routes configured.`,
			"",
			`Add a route for ${origin} in the Cloudflare dashboard:`,
			dashboardUrl,
			"",
		].join("\n");
	}

	return [
		`Tunnel "${name}" has no route for ${origin}`,
		"",
		"Resolved routes:",
		...ingress.map(
			({ hostname, service }) =>
				`  - ${hostname ?? "(no hostname)"} -> ${service}`
		),
		"",
		"Update your local server settings or the tunnel routes in the Cloudflare dashboard:",
		dashboardUrl,
		"",
	].join("\n");
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
	let cloudflaredProcess: ChildProcess | undefined;

	const logger = options.logger;
	const timeoutMs = options.timeoutMs ?? TUNNEL_STARTUP_TIMEOUT_MS;
	const reminderIntervalMs =
		options.reminderIntervalMs ?? DEFAULT_TUNNEL_REMINDER_INTERVAL_MS;
	const defaultExpiryMs = options.expiryMs ?? DEFAULT_TUNNEL_EXPIRY_MS;
	const isNamedTunnel = options.token !== undefined;
	const timeFormatter = new Intl.DateTimeFormat(undefined, {
		timeStyle: "short",
	});
	const cloudflaredArgs = isNamedTunnel
		? ["tunnel", "--no-autoupdate", "run"]
		: ["tunnel", "--no-autoupdate", "--url", options.origin.href];

	const cloudflaredPromise = spawnCloudflared(cloudflaredArgs, {
		stdio: "pipe",
		env: options.token ? { TUNNEL_TOKEN: options.token } : undefined,
		skipVersionCheck: true,
		logger,
	}).then((process) => {
		cloudflaredProcess = process;

		if (disposed) {
			terminateCloudflared(process);
		}

		return process;
	});

	const readyPromise = cloudflaredPromise
		.then((process) => {
			if (isNamedTunnel) {
				return { mode: "named" } as const;
			}

			return waitForQuickTunnelReady(process, timeoutMs, {
				logger,
				origin: options.origin,
			});
		})
		.then((result) => {
			expiresAt = Date.now() + defaultExpiryMs;

			scheduleExpiryTimeout();
			scheduleReminder(
				result.mode === "quick" ? result.publicUrl.origin : undefined
			);

			return result;
		});

	function disposeTunnel() {
		disposed = true;
		clearTunnelTimers();

		if (cloudflaredProcess) {
			terminateCloudflared(cloudflaredProcess);
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

	function scheduleReminder(publicURL: string | undefined) {
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
					`${
						publicURL
							? `Tunnel still open, expires in ${formatTunnelDuration(remainingMs)}: ${publicURL}`
							: `The tunnel is still open. It expires in ${formatTunnelDuration(remainingMs)}.`
					}${options.extendHint ? ` ${options.extendHint}` : ""}`
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
				disposeTunnel();
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
		isOpen: () => !disposed,
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

	cloudflared.unref();
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
	options: { logger?: Pick<Logger, "debug" | "log" | "warn">; origin: URL }
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
					resolve({ mode: "quick", publicUrl: new URL(match[0]) });
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
		`The local dev server started at ${origin.href}\n` +
		(isQuickTunnelRateLimited
			? "Cloudflare Quick Tunnel creation was rate limited. Try again in a few minutes, or use a named tunnel if you need more reliable access."
			: `Check the cloudflared output above for more details, and verify that ${origin.href} is reachable from this machine if this keeps happening.`);

	if (isQuickTunnelRateLimited) {
		return new UserError(errorMessage, { telemetryMessage: false });
	}

	return new Error(errorMessage);
}
