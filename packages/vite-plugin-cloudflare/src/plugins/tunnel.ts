import { startTunnel } from "@cloudflare/workers-utils";
import colors from "picocolors";
import { assertIsNotPreview } from "../context";
import { debuglog, createPlugin } from "../utils";
import type { PluginContext } from "../context";
import type { Tunnel } from "@cloudflare/workers-utils";
import type * as vite from "vite";

export const PUBLIC_EXPOSURE_WARNING = [
	"",
	`     ${colors.dim("This URL is ")}publicly accessible${colors.dim(". Anyone with it can:")}`,
	colors.dim("     • Call ungated endpoints"),
	colors.dim("     • Trigger logic that uses remote bindings"),
	colors.dim("     • Reach internal services if your Worker proxies requests"),
	colors.dim("     • Access HMR messages and request module source"),
	"",
	colors.dim(
		"     Consider using a named tunnel with Cloudflare Access to restrict access."
	),
	"",
].join("\n");

export const QUICK_TUNNEL_SSE_WARNING =
	"Quick tunnels do not support Server-Sent Events (SSE). Use a named Cloudflare Tunnel if you need SSE over a public URL.";

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
		if (this.#origin === origin && this.#tunnel) {
			return await this.#waitForPublicUrl(this.#tunnel);
		}

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

export async function setupTunnel(
	server: vite.ViteDevServer,
	ctx: PluginContext,
	manager: TunnelManager
): Promise<void> {
	const origin = await getTunnelOrigin(server);

	if (manager.isStarted(origin)) {
		debuglog("Tunnel is already started on", origin);
		return;
	}

	try {
		server.config.logger.info(
			colors.dim("\n  ➜  Starting tunnel (usually takes a few seconds)...\n")
		);

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
	} catch (error) {
		throw new Error(
			`Failed to start tunnel: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
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

			const serverPrintUrls = server.printUrls.bind(server);
			server.printUrls = () => {
				serverPrintUrls();

				const publicUrl = tunnelManager.publicUrl;
				if (!publicUrl) {
					return;
				}

				server.config.logger.info(
					`${colors.green("  ➜")}  ${colors.bold("Tunnel:")}  ${colors.cyan(publicUrl)}`
				);
				server.config.logger.warnOnce(PUBLIC_EXPOSURE_WARNING);
			};

			const serverListen = server.listen.bind(server);
			server.listen = async (...args) => {
				const result = await serverListen(...args);

				try {
					await setupTunnel(server, ctx, tunnelManager);
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
	};
});
