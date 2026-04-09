import { startTunnel } from "@cloudflare/workers-utils";
import colors from "picocolors";
import { assertIsNotPreview } from "../context";
import { debuglog, createPlugin } from "../utils";
import type { PluginContext } from "../context";
import type { Tunnel } from "@cloudflare/workers-utils";
import type * as vite from "vite";

export const PUBLIC_EXPOSURE_WARNING = [
	"Your local dev server will be publicly accessible.",
	"Anyone with the URL can interact with your app, e.g.:",
	"- Call ungated endpoints in your app",
	"- Trigger app logic that reads or writes through remote bindings",
	"- Reach internal services if your Worker proxies requests",
	"- Access HMR messages and request module source",
	"",
	"Consider disabling HMR with `server.hmr = false` or restricting access with a named tunnel + Cloudflare Access.",
].join("\n");

export const QUICK_TUNNEL_SSE_WARNING =
	'Quick tunnels do not support Server-Sent Events (SSE). For SSE support, set `tunnel: "<hostname>"` in your `cloudflare()` Vite plugin config.';

export class TunnelManager {
	#logger: vite.Logger;
	#origin?: string;
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
			void this.dispose();
		}

		this.#origin = origin;

		const tunnel = startTunnel({
			origin: new URL(origin),
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
				return null;
			}

			return publicUrl.toString();
		} catch (error) {
			if (this.#tunnel !== tunnel) {
				return null;
			}

			this.#tunnel = undefined;
			throw error;
		}
	}

	warnIfQuickTunnelSseResponse(contentType: string | null) {
		if (
			this.#hasWarnedAboutSse ||
			!this.#tunnel ||
			!isSseContentType(contentType)
		) {
			return;
		}

		this.#hasWarnedAboutSse = true;
		this.#logger.warn(QUICK_TUNNEL_SSE_WARNING);
	}

	async dispose() {
		const tunnel = this.#tunnel;

		this.#origin = undefined;
		this.#tunnel = undefined;
		this.#hasWarnedAboutSse = false;

		if (tunnel) {
			await tunnel.dispose();
		}
	}
}

let tunnelManager: TunnelManager | undefined = undefined;

process.on("exit", () => {
	void tunnelManager?.dispose();
});

export function warnIfQuickTunnelSseResponse(contentType: string | null) {
	tunnelManager?.warnIfQuickTunnelSseResponse(contentType);
}

export async function getTunnelOrigin(server: vite.ViteDevServer) {
	if (!server.httpServer?.listening) {
		await new Promise<void>((resolve) => {
			server.httpServer?.once("listening", () => resolve());
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
): Promise<string | null> {
	try {
		const origin = await getTunnelOrigin(server);

		if (manager.isStarted(origin)) {
			return null;
		}

		server.config.logger.info(
			colors.dim("  ➜") +
				colors.dim("  Starting tunnel (usually takes 5-15s)...")
		);

		const publicURL = await manager.startTunnel(origin);

		if (!publicURL) {
			// This happens if the tunnel was restarted with a different origin before the first tunnel finished starting.
			// In this case, we don't want to log anything since the new tunnel will log its own URL once it's ready.
			return null;
		}

		const tunnelHostname = new URL(publicURL).hostname;
		if (!ctx.tunnelHostnames.has(tunnelHostname)) {
			ctx.tunnelHostnames.clear();
			ctx.tunnelHostnames.add(tunnelHostname);
			await server.restart();
		}

		server.config.logger.warn(PUBLIC_EXPOSURE_WARNING);
		server.config.logger.info(
			`  ${colors.green("➜")}  ${colors.bold("Tunnel")}:  ${colors.dim(
				colors.yellow(publicURL)
			)}`
		);

		return publicURL;
	} catch (error) {
		server.config.logger.error(
			`Failed to start tunnel: ${error instanceof Error ? error.message : String(error)}`
		);
		return null;
	}
}

export function isSseContentType(contentType: string | null): boolean {
	return (
		typeof contentType === "string" &&
		contentType.toLowerCase().startsWith("text/event-stream")
	);
}

export const tunnelPlugin = createPlugin("tunnel", (ctx) => {
	return {
		async buildEnd() {
			if (!ctx.isRestartingDevServer) {
				ctx.tunnelHostnames.clear();
				await tunnelManager?.dispose();
			}
		},
		async configureServer(server) {
			assertIsNotPreview(ctx);

			if (!ctx.resolvedPluginConfig.tunnel) {
				ctx.tunnelHostnames.clear();
				await tunnelManager?.dispose();
				return;
			}

			tunnelManager ??= new TunnelManager(server.config.logger);

			await setupTunnel(server, ctx, tunnelManager);
		},
	};
});
