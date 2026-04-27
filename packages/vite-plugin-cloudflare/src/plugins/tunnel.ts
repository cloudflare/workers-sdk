import { startTunnel } from "@cloudflare/workers-utils";
import getPort from "get-port";
import { buildPublicUrl } from "miniflare";
import colors from "picocolors";
import { assertIsNotPreview, assertIsPreview } from "../context";
import { debuglog, createPlugin } from "../utils";
import type { PluginContext } from "../context";
import type { Tunnel } from "@cloudflare/workers-utils";
import type * as vite from "vite";

const COMMON_PUBLIC_EXPOSURE_CONCERNS = [
	"Call ungated endpoints",
	"Trigger logic that uses remote bindings",
	"Reach internal services if your Worker proxies requests",
];
const COMMON_PUBLIC_EXPOSURE_GUIDANCE =
	"Consider using a named tunnel with Cloudflare Access to restrict access.";

function createPublicExposureWarning(concerns: string[], guidance: string) {
	return [
		"",
		`     ${colors.dim("This URL is ")}publicly accessible${colors.dim(". Anyone with it can:")}`,
		...concerns.map((concern) => colors.dim(`     • ${concern}`)),
		"",
		colors.dim(`     ${guidance}`),
		"",
	].join("\n");
}

export const DEV_PUBLIC_EXPOSURE_WARNING = createPublicExposureWarning(
	[
		...COMMON_PUBLIC_EXPOSURE_CONCERNS,
		"Request module source and other dev-server assets",
		"Access HMR messages, including absolute file system paths",
		"Observe file-change cadence and parts of the live module graph",
	],
	`If you only need to share a running build, use vite preview to avoid HMR and other dev-server exposure. ${COMMON_PUBLIC_EXPOSURE_GUIDANCE}`
);

export const PREVIEW_PUBLIC_EXPOSURE_WARNING = createPublicExposureWarning(
	COMMON_PUBLIC_EXPOSURE_CONCERNS,
	COMMON_PUBLIC_EXPOSURE_GUIDANCE
);

export const QUICK_TUNNEL_SSE_WARNING =
	"Quick tunnels do not support Server-Sent Events (SSE). Use a named Cloudflare Tunnel if you need SSE over a public URL.";

export const QUICK_TUNNEL_ALLOWED_HOST = ".trycloudflare.com";

export class TunnelManager {
	#logger: vite.Logger;
	#origin?: string;
	#publicUrl?: string;
	#tunnel?: Tunnel;
	#hasWarnedAboutSse = false;

	constructor(logger: vite.Logger) {
		this.#logger = logger;
	}

	isStarted(origin: string): boolean {
		return this.#origin === origin && this.#tunnel !== undefined;
	}

	async startTunnel(origin: string): Promise<string | null> {
		try {
			if (this.#origin === origin && this.#tunnel) {
				return await this.#waitForPublicUrl(this.#tunnel);
			}

			this.#logger.info(
				colors.dim("\n  ➜  Starting tunnel (usually takes a few seconds)...\n")
			);

			const previousTunnel = this.#tunnel;

			if (previousTunnel) {
				this.dispose();
			}

			this.#origin = origin;
			this.#publicUrl = undefined;

			const tunnel = startTunnel({
				origin: new URL(origin),
				extendHint: "Press t + enter to extend by 1 hour.",
				logger: {
					log: (message) => this.#logger.info(message),
					warn: (message) => this.#logger.warn(message),
					debug: (message) => debuglog(message),
				},
			});
			this.#tunnel = tunnel;

			return await this.#waitForPublicUrl(tunnel);
		} catch (error) {
			throw new Error(
				`Failed to start tunnel: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
	}

	async #waitForPublicUrl(tunnel: Tunnel): Promise<string | null> {
		try {
			const { publicUrl } = await tunnel.ready();
			if (this.#tunnel !== tunnel) {
				debuglog(
					"Tunnel was restarted before it finished starting. Ignoring this tunnel's public URL:",
					publicUrl
				);
				return null;
			}

			debuglog("Tunnel is ready with public URL:", publicUrl);
			this.#publicUrl = publicUrl.toString();
			return publicUrl.toString();
		} catch (error) {
			if (this.#tunnel !== tunnel) {
				return null;
			}

			this.#publicUrl = undefined;
			this.#tunnel = undefined;
			throw error;
		}
	}

	get publicUrl(): string | undefined {
		return this.#publicUrl;
	}

	extendExpiry() {
		this.#tunnel?.extendExpiry();
	}

	warnIfQuickTunnelSseResponse(contentType: string | null) {
		if (
			this.#hasWarnedAboutSse ||
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

		this.#origin = undefined;
		this.#publicUrl = undefined;
		this.#tunnel = undefined;
		this.#hasWarnedAboutSse = false;

		debuglog("Disposing tunnel...");

		if (tunnel) {
			tunnel.dispose();
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

export async function getTunnelOrigin(server: vite.ViteDevServer) {
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

export async function resolvePreviewTunnelOrigin(server: vite.PreviewServer) {
	const { preview } = server.config;
	const host = typeof preview.host === "string" ? preview.host : undefined;
	let resolvedPort: number;

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
	manager: TunnelManager
): Promise<void> {
	const origin = await getTunnelOrigin(server);

	if (manager.isStarted(origin)) {
		debuglog("Tunnel is already started on", origin);
		return;
	}

	const publicUrl = await manager.startTunnel(origin);

	if (!publicUrl) {
		// This happens if the tunnel was restarted with a different origin before the first tunnel finished starting.
		// In this case, we don't want to log anything since the new tunnel will log its own URL once it's ready.
		return;
	}

	const allowedHosts = server.config.server.allowedHosts;
	const tunnelHostnames = [new URL(publicUrl).hostname];

	ctx.replaceTunnelHostnames(tunnelHostnames);

	if (
		allowedHosts !== true &&
		tunnelHostnames.some((hostname) => !allowedHosts.includes(hostname))
	) {
		await server.restart();
	}
}

export async function setupPreviewTunnel(
	server: vite.PreviewServer,
	manager: TunnelManager
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

	await manager.startTunnel(resolvedOrigin.toString());
}

function patchPrintUrls(
	server: vite.ViteDevServer | vite.PreviewServer,
	warning: string
) {
	const serverPrintUrls = server.printUrls.bind(server);
	server.printUrls = () => {
		serverPrintUrls();

		const publicUrl = tunnelManager?.publicUrl;
		if (!publicUrl) {
			return;
		}

		server.config.logger.info(
			`${colors.green("  ➜")}  ${colors.bold("Tunnel:")}  ${colors.cyan(publicUrl)}`
		);
		server.config.logger.warnOnce(warning);
	};
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

			if (!ctx.resolvedPluginConfig.tunnel) {
				stopTunnel();
				return;
			}

			tunnelManager ??= new TunnelManager(server.config.logger);
			patchPrintUrls(server, DEV_PUBLIC_EXPOSURE_WARNING);

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

			if (!ctx.resolvedPluginConfig.tunnel) {
				stopTunnel();
				return;
			}

			tunnelManager ??= new TunnelManager(server.config.logger);
			patchPrintUrls(server, PREVIEW_PUBLIC_EXPOSURE_WARNING);
			await setupPreviewTunnel(server, tunnelManager);

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
