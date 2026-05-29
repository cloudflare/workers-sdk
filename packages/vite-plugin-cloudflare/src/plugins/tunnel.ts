import { startTunnel } from "@cloudflare/workers-utils";
import getPort from "get-port";
import { buildPublicUrl } from "miniflare";
import colors from "picocolors";
import encodeQR from "qr";
import * as wrangler from "wrangler";
import { assertIsNotPreview, assertIsPreview } from "../context";
import { debuglog, createPlugin } from "../utils";
import type { PluginContext } from "../context";
import type { Tunnel } from "@cloudflare/workers-utils";
import type * as vite from "vite";

function createPublicExposureWarning(
	mode: "dev" | "preview",
	name: string | undefined,
	shortcutPressed: boolean
) {
	const intro =
		name === undefined
			? colors.dim("Once connected, this tunnel will be ") +
				"publicly accessible" +
				colors.dim(". Anyone who can reach it can:")
			: colors.dim(
					"Once connected, this tunnel may be reachable from the Internet. " +
						"Anyone who can reach it can:"
				);
	const concerns = [
		"Call ungated endpoints",
		"Trigger logic that uses remote bindings",
		"Reach internal services if your Worker proxies requests",
	];
	const hints = [
		name === undefined
			? "Consider using a named tunnel with Cloudflare Access to restrict access."
			: "Consider using Cloudflare Access to restrict access.",
	];

	if (mode === "dev") {
		concerns.push(
			"Request module source and other dev-server assets",
			"Access HMR messages, including absolute file system paths",
			"Observe file-change cadence and parts of the live module graph"
		);
		hints.unshift(
			"If you only need to share a running build, use vite preview to avoid HMR and other dev-server exposure."
		);
	}

	const lines = [
		intro,
		...concerns.map((concern) => colors.dim(`• ${concern}`)),
		"",
		...hints.map((guidance) => colors.dim(guidance)),
		"",
	];

	if (shortcutPressed) {
		lines.push("Press t + enter again to close the tunnel.", "");
	}

	const spacing = "     ";

	return lines.map((line) => spacing + line).join("\n");
}

export const QUICK_TUNNEL_SSE_WARNING =
	"Quick tunnels do not support Server-Sent Events (SSE). Use a named Cloudflare Tunnel if you need SSE over a public URL.";

export const QUICK_TUNNEL_ALLOWED_HOST = ".trycloudflare.com";

export class TunnelManager {
	#logger: vite.Logger;
	#origin?: string;
	#publicUrls?: string[];
	#requestedTunnel?: string | undefined;
	#tunnel?: Tunnel;
	#abortController?: AbortController;
	#hasWarnedAboutSse = false;

	constructor(logger: vite.Logger) {
		this.#logger = logger;
	}

	isStarted(origin: string, name: string | undefined): boolean {
		return this.#origin === origin && this.#requestedTunnel === name;
	}

	isOpen(): boolean {
		if (!this.#tunnel) {
			return this.#origin !== undefined;
		}

		const isOpen = this.#tunnel.isOpen();

		// If the tunnel is expired, dispose it to clean up resources and reset state.
		if (!isOpen) {
			// Set tunnel to undefined before disposing to prevent interact with the already-closed tunnel
			this.#tunnel = undefined;
			this.dispose();
		}

		return isOpen;
	}

	async startTunnel(options: {
		origin: string;
		name: string | undefined;
		mode: "dev" | "preview";
		shortcutPressed?: boolean;
		allowedHosts: true | string[] | undefined;
		accountId: string | undefined;
		complianceRegion: wrangler.Unstable_Config["compliance_region"];
	}): Promise<string[] | null> {
		try {
			const previousTunnel = this.#tunnel;

			if (previousTunnel) {
				this.dispose();
			}

			const abortController = new AbortController();
			this.#abortController = abortController;
			this.#origin = options.origin;
			this.#requestedTunnel = options.name;
			this.#logger.info(
				colors.dim("\n  ➜  Starting tunnel (usually takes a few seconds)...\n")
			);
			this.#logger.warn(
				createPublicExposureWarning(
					options.mode,
					options.name,
					options.shortcutPressed ?? false
				)
			);

			const namedTunnel =
				options.name !== undefined
					? await wrangler.unstable_resolveNamedTunnel(
							options.name,
							new URL(options.origin),
							{
								accountId: options.accountId,
								complianceRegion: options.complianceRegion,
							}
						)
					: undefined;

			if (abortController.signal.aborted) {
				return null;
			}

			if (namedTunnel) {
				this.#publicUrls = namedTunnel.hostnames.map(
					(hostname) => `https://${hostname}`
				);
			}

			if (options.mode === "preview") {
				if (namedTunnel) {
					const allowedUrls = getAllowedTunnelUrls(
						this.#publicUrls ?? [],
						options.allowedHosts
					);

					if (allowedUrls.length === 0) {
						const suggestedAllowedHosts = getSuggestedAllowedHosts(
							namedTunnel.hostnames
						);

						throw new Error(
							"The resolved tunnel hostnames are not allowed by Vite preview host validation.\n" +
								"\n" +
								"Add at least one of these hosts to `preview.allowedHosts` in your Vite config.\n" +
								"You can use exact hostnames or a domain suffix:\n" +
								suggestedAllowedHosts
									.map((hostname) => `  - ${hostname}`)
									.join("\n") +
								"\n"
						);
					}

					this.#publicUrls = allowedUrls;
				} else if (!isQuickTunnelAllowed(options.allowedHosts)) {
					throw new Error(
						"Quick tunnel hostnames are not allowed by Vite preview host validation.\n" +
							`Add \`${QUICK_TUNNEL_ALLOWED_HOST}\` to \`preview.allowedHosts\` in your Vite config.\n`
					);
				}
			}

			const tunnel = startTunnel({
				origin: new URL(options.origin),
				token: namedTunnel?.token,
				extendHint: "Press a + enter to extend by 1 hour.",
				logger: {
					log: (message) => this.#logger.info(message),
					warn: (message) => this.#logger.warn(message),
					debug: (message) => debuglog(message),
				},
			});
			this.#tunnel = tunnel;

			return await this.#waitForPublicUrls(tunnel);
		} catch (error) {
			this.#origin = undefined;
			this.#publicUrls = undefined;
			this.#requestedTunnel = undefined;

			throw error;
		}
	}

	async #waitForPublicUrls(tunnel: Tunnel): Promise<string[] | null> {
		try {
			const result = await tunnel.ready();
			if (this.#tunnel !== tunnel) {
				debuglog(
					"Tunnel was restarted before it finished starting. Ignoring this tunnel's public URL:",
					result.mode === "quick" ? result.publicUrl : this.#publicUrls
				);
				return null;
			}

			if (result.mode === "named") {
				return this.#publicUrls ?? null;
			}

			const { publicUrl } = result;

			debuglog("Tunnel is ready with public URL:", publicUrl);
			this.#publicUrls = [publicUrl.toString()];
			return this.#publicUrls;
		} catch (error) {
			if (this.#tunnel !== tunnel) {
				return null;
			}

			this.#tunnel = undefined;
			throw error;
		}
	}

	get publicUrls(): string[] | undefined {
		return this.#publicUrls;
	}

	extendExpiry() {
		this.#tunnel?.extendExpiry();
	}

	warnIfQuickTunnelSseResponse(contentType: string | null) {
		if (
			this.#hasWarnedAboutSse ||
			this.#requestedTunnel !== undefined ||
			!this.#tunnel ||
			contentType === null ||
			!contentType.toLowerCase().startsWith("text/event-stream")
		) {
			return;
		}

		this.#hasWarnedAboutSse = true;
		this.#logger.warn(QUICK_TUNNEL_SSE_WARNING);
	}

	dispose() {
		const tunnel = this.#tunnel;
		const wasTunnelStarted = this.#origin !== undefined;

		this.#abortController?.abort();
		this.#origin = undefined;
		this.#publicUrls = undefined;
		this.#requestedTunnel = undefined;
		this.#tunnel = undefined;
		this.#hasWarnedAboutSse = false;

		debuglog("Disposing tunnel...");

		if (tunnel) {
			tunnel.dispose();
		}

		// The tunnel may still be starting or may have already expired.
		// Use origin to identify whether tunnel startup had begun
		if (wasTunnelStarted) {
			this.#logger.info("  ➜  Tunnel closed");
		}
	}

	disposeOnExit() {
		try {
			this.dispose();
		} catch (e) {
			this.#logger.error(
				"Failed to dispose tunnel on exit:" +
					(e instanceof Error ? e.message : `${e}`)
			);
		}
	}
}

let tunnelManager: TunnelManager;

process.on("exit", () => {
	tunnelManager?.disposeOnExit();
});

export function warnIfQuickTunnelSseResponse(contentType: string | null) {
	tunnelManager?.warnIfQuickTunnelSseResponse(contentType);
}

export function extendTunnelExpiry() {
	tunnelManager?.extendExpiry();
}

export function isTunnelOpen() {
	return tunnelManager?.isOpen() ?? false;
}

export async function toggleTunnel(
	server: vite.ViteDevServer | vite.PreviewServer,
	ctx: PluginContext
) {
	if (!tunnelManager) {
		return;
	}

	if (tunnelManager.isOpen()) {
		ctx.clearTunnelHostnames();
		tunnelManager.dispose();
		return;
	}

	if ("restart" in server) {
		await setupDevTunnel(server, ctx, tunnelManager, true);
	} else {
		await setupPreviewTunnel(server, ctx, tunnelManager, true);
	}
}

/**
 * Resolve the dev tunnel origin from the running server.
 *
 * This simply waits for Vite to start listening and then reuses its resolved URL.
 */
export async function resolveDevTunnelOrigin(server: vite.ViteDevServer) {
	const httpServer = server.httpServer;

	if (!httpServer) {
		throw new Error(
			"No HTTP server available for tunnel sharing. Tunnels are not supported in middleware mode."
		);
	}

	if (!httpServer.listening) {
		await new Promise<void>((resolve) => {
			httpServer.once("listening", () => resolve());
		});
	}

	const url =
		server.resolvedUrls?.local?.[0] ?? server.resolvedUrls?.network?.[0];

	if (!url) {
		throw new Error(
			"Could not determine the local dev server URL for tunnel sharing."
		);
	}

	return url;
}

/**
 * Resolve the preview tunnel origin before preview starts listening.
 *
 * Unlike dev, preview does not give us a similar `server.listen()` hook where
 * we can wait for the final bound URL before starting the tunnel. We resolve
 * the port up front using Vite's preview port rules so the tunnel and preview
 * server agree on the same origin:
 *
 * - `port: 0`: use any free port
 * - `strictPort: true`: use the exact port or fail
 * - otherwise: use the first free port at or above `preview.port`
 */
export async function resolvePreviewTunnelOrigin(server: vite.PreviewServer) {
	const { preview } = server.config;
	const host = typeof preview.host === "string" ? preview.host : undefined;

	let resolvedPort = preview.port;

	if (!server.httpServer.listening) {
		if (preview.port === 0) {
			resolvedPort = await getPort({ port: 0, host });
		} else if (preview.strictPort) {
			resolvedPort = await getPort({ port: preview.port, host });
			if (resolvedPort !== preview.port) {
				throw new Error(`Port ${preview.port} is already in use.`);
			}
		} else {
			function* candidatePorts() {
				for (let port = preview.port; port <= 65535; port++) {
					yield port;
				}
			}

			resolvedPort = await getPort({
				host,
				port: candidatePorts(),
			});
		}
	}

	return new URL(
		buildPublicUrl({
			hostname: host,
			port: resolvedPort,
			secure: !!preview.https,
		})
	);
}

export async function setupDevTunnel(
	server: vite.ViteDevServer,
	ctx: PluginContext,
	manager: TunnelManager,
	shortcutPressed?: boolean
): Promise<void> {
	const origin = await resolveDevTunnelOrigin(server);
	const tunnel = ctx.resolvedPluginConfig.tunnel;

	if (manager.isStarted(origin, tunnel.name)) {
		debuglog("Tunnel is already started on", origin);
		return;
	}

	const publicUrls = await manager.startTunnel({
		mode: "dev",
		origin,
		shortcutPressed,
		name: tunnel.name,
		accountId: ctx.entryWorkerConfig?.account_id,
		complianceRegion: ctx.entryWorkerConfig?.compliance_region,
		// We will restart the server with the tunnel hostnames in allowedHosts if needed
		allowedHosts: true,
	});

	if (!publicUrls) {
		// This happens if the tunnel was restarted with a different origin before the first tunnel finished starting.
		// In this case, we don't want to log anything since the new tunnel will log its own URL once it's ready.
		return;
	}

	const allowedHosts = server.config.server.allowedHosts;
	const tunnelHostnames = publicUrls.map((url) => new URL(url).hostname);

	ctx.replaceTunnelHostnames(tunnelHostnames);

	if (
		allowedHosts !== true &&
		tunnelHostnames.some((hostname) => !allowedHosts.includes(hostname))
	) {
		await server.restart();
	}

	if (shortcutPressed) {
		server.printUrls();
	}
}

/**
 * Start a preview tunnel on the resolved preview origin.
 *
 * We write the resolved port back to preview config so the server binds the
 * same port that the tunnel is sharing.
 */
export async function setupPreviewTunnel(
	server: vite.PreviewServer,
	ctx: PluginContext,
	manager: TunnelManager,
	shortcutPressed?: boolean
): Promise<void> {
	const { preview } = server.config;
	const originalPort = preview.port;
	const resolvedOrigin = await resolvePreviewTunnelOrigin(server);
	const resolvedPort = Number(resolvedOrigin.port);

	// Update the preview server config with the resolved port so that the tunnel shares the correct URL.
	preview.port = resolvedPort;
	preview.strictPort = true;

	if (originalPort !== 0 && resolvedPort !== originalPort) {
		server.config.logger.info(
			colors.dim(
				`Port ${originalPort} is in use, using ${resolvedPort} instead for preview tunnel sharing.\n`
			)
		);
	}

	const tunnel = ctx.resolvedPluginConfig.tunnel;
	const origin = resolvedOrigin.toString();

	if (manager.isStarted(origin, tunnel.name)) {
		debuglog("Tunnel is already started on", origin);
		return;
	}

	const publicUrls = await manager.startTunnel({
		mode: "preview",
		origin,
		shortcutPressed,
		name: tunnel.name,
		allowedHosts: preview?.allowedHosts,
		accountId: ctx.allWorkerConfigs[0]?.account_id,
		complianceRegion: ctx.allWorkerConfigs[0]?.compliance_region,
	});

	if (!publicUrls) {
		return;
	}

	if (shortcutPressed) {
		server.printUrls();
	}
}

function patchPrintUrls(server: vite.ViteDevServer | vite.PreviewServer) {
	const serverPrintUrls = server.printUrls.bind(server);
	server.printUrls = () => {
		serverPrintUrls();

		const publicUrls = tunnelManager?.publicUrls;
		if (!publicUrls || publicUrls.length === 0) {
			return;
		}

		for (let i = 0; i < publicUrls.length; i++) {
			if (i === 0) {
				server.config.logger.info(
					`${colors.green("  ➜")}  ${colors.bold("Tunnel:")}  ${colors.cyan(publicUrls[i])}`
				);
			} else {
				server.config.logger.info(
					`              ${colors.cyan(publicUrls[i])}`
				);
			}
		}

		// Print a QR code for the first tunnel URL so it can be scanned from a mobile device
		const primaryUrl = publicUrls[0];
		if (primaryUrl) {
			try {
				const qrCode = encodeQR(primaryUrl, "ascii", { border: 1 });
				server.config.logger.info(`\n${qrCode}`);
			} catch {
				// QR generation is best-effort; don't disrupt the dev session if it fails
			}
		}

		// Add an extra newline after the URLs to improve readability
		server.config.logger.info("");
	};
}

function isQuickTunnelAllowed(
	allowedHosts: true | string[] | undefined
): boolean {
	if (allowedHosts === undefined) {
		return false;
	}

	if (allowedHosts === true) {
		return true;
	}

	return allowedHosts.some(
		(allowedHost) => allowedHost.toLowerCase() === QUICK_TUNNEL_ALLOWED_HOST
	);
}

function getAllowedTunnelUrls(
	publicUrls: string[],
	allowedHosts: true | string[] | undefined
): string[] {
	if (allowedHosts === undefined) {
		return [];
	}

	if (allowedHosts === true) {
		return publicUrls;
	}

	return publicUrls.filter((publicUrl) => {
		const hostname = new URL(publicUrl).hostname.toLowerCase();

		return allowedHosts.some((allowedHost) => {
			const normalizedAllowedHost = allowedHost.toLowerCase();

			if (normalizedAllowedHost.startsWith(".")) {
				return (
					hostname === normalizedAllowedHost.slice(1) ||
					hostname.endsWith(normalizedAllowedHost)
				);
			}

			return hostname === normalizedAllowedHost;
		});
	});
}

function getSuggestedAllowedHosts(hostnames: string[]): string[] {
	const suggestions = new Set(hostnames);

	for (const hostname of hostnames) {
		const segments = hostname.split(".");
		if (segments.length > 2) {
			suggestions.add(`.${segments.slice(1).join(".")}`);
		}
	}

	return Array.from(suggestions);
}

export const tunnelPlugin = createPlugin("tunnel", (ctx) => {
	function stopTunnel() {
		ctx.clearTunnelHostnames();
		tunnelManager?.dispose();
	}

	return {
		/**
		 * Vite runs `buildEnd` when the dev server restarts or closes.
		 */
		buildEnd() {
			if (!ctx.isRestartingDevServer) {
				stopTunnel();
			}
		},
		configureServer(server) {
			assertIsNotPreview(ctx);

			tunnelManager ??= new TunnelManager(server.config.logger);
			patchPrintUrls(server);

			if (!ctx.resolvedPluginConfig.tunnel.autoStart) {
				return;
			}

			const serverListen = server.listen.bind(server);
			server.listen = async (...args) => {
				const result = await serverListen(...args);

				try {
					await setupDevTunnel(server, ctx, tunnelManager);
					return result;
				} catch (error) {
					await Promise.allSettled([
						(async () => {
							stopTunnel();
						})(),
						server.close(),
					]);

					// The user explicitly requested tunnel sharing, so tunnel startup failure is fatal.
					throw error;
				}
			};
		},
		async configurePreviewServer(server) {
			assertIsPreview(ctx);

			tunnelManager ??= new TunnelManager(server.config.logger);
			patchPrintUrls(server);

			if (ctx.resolvedPluginConfig.tunnel.autoStart) {
				await setupPreviewTunnel(server, ctx, tunnelManager);
			}

			const closePreviewServer = server.close.bind(server);
			server.close = async () => {
				const closePromise = closePreviewServer();

				try {
					stopTunnel();
				} finally {
					await closePromise;
				}
			};
		},
	};
});
