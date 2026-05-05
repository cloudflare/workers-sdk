import { stripVTControlCharacters } from "node:util";
import { startTunnel } from "@cloudflare/workers-utils";
import { createServer, preview } from "vite";
import {
	afterEach,
	beforeEach,
	describe,
	it,
	onTestFinished,
	vi,
} from "vitest";
import { PluginContext } from "../context";
import {
	DEV_PUBLIC_EXPOSURE_WARNING,
	PREVIEW_PUBLIC_EXPOSURE_WARNING,
	resolveDevTunnelOrigin,
	setupPreviewTunnel,
	TunnelManager,
	setupDevTunnel,
	tunnelPlugin,
} from "../plugins/tunnel";
import type * as vite from "vite";

vi.mock("@cloudflare/workers-utils");

describe("tunnel plugin", () => {
	beforeEach(() => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "quick",
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("starts a tunnel after the server starts listening", async ({
		expect,
	}) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "quick",
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const server = await createServer();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		const tunnelManager = new TunnelManager(server.config.logger);
		const restart = vi.spyOn(server, "restart").mockResolvedValue();

		const info = vi
			.spyOn(server.config.logger, "info")
			.mockReturnValue(undefined);
		const error = vi
			.spyOn(server.config.logger, "error")
			.mockReturnValue(undefined);

		onTestFinished(() => server.close());

		await server.listen(0);
		await setupDevTunnel(server, ctx, tunnelManager);

		expect(ctx.getTunnelHostnames()).toEqual(["example.trycloudflare.com"]);
		expect(restart).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenCalledWith({
			origin: new URL(server.resolvedUrls?.local?.[0] ?? ""),
			extendHint: "Press t + enter to extend by 1 hour.",
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});
		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
		expect(tunnelManager.publicUrl).toBe("https://example.trycloudflare.com/");

		const infoLog = info.mock.calls
			.map(([message]) => stripVTControlCharacters(message))
			.join("\n");
		expect(infoLog).not.toContain("Tunnel:");
	});

	it("reuses the same tunnel when the origin is unchanged", async ({
		expect,
	}) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "quick",
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const server = await createServer();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		const tunnelManager = new TunnelManager(server.config.logger);
		const restart = vi.spyOn(server, "restart").mockResolvedValue();

		onTestFinished(() => server.close());

		await server.listen(0);
		await setupDevTunnel(server, ctx, tunnelManager);

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(restart).toHaveBeenCalledTimes(1);
		restart.mockClear();

		await server.restart();

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(restart).toHaveBeenCalledTimes(1);
		restart.mockClear();

		await setupDevTunnel(server, ctx, tunnelManager);

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(restart).not.toHaveBeenCalled();
	});

	it("starts a new tunnel when the origin changes", async ({ expect }) => {
		vi.mocked(startTunnel)
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					mode: "quick",
					publicUrl: new URL("https://foo.trycloudflare.com"),
				}),
				extendExpiry: vi.fn(),
				dispose: vi.fn(),
			})
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					mode: "quick",
					publicUrl: new URL("https://bar.trycloudflare.com"),
				}),
				extendExpiry: vi.fn(),
				dispose: vi.fn(),
			});

		const server1 = await createServer();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		const tunnelManager = new TunnelManager(server1.config.logger);
		const restart1 = vi.spyOn(server1, "restart").mockResolvedValue();
		onTestFinished(() => server1.close());

		await server1.listen(0);
		await setupDevTunnel(server1, ctx, tunnelManager);

		expect(ctx.getTunnelHostnames()).toEqual(["foo.trycloudflare.com"]);
		expect(restart1).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenNthCalledWith(1, {
			origin: new URL(server1.resolvedUrls?.local?.[0] ?? ""),
			extendHint: "Press t + enter to extend by 1 hour.",
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});

		const server2 = await createServer();
		const restart2 = vi.spyOn(server2, "restart").mockResolvedValue();
		onTestFinished(() => server2.close());

		await server2.listen(0);

		expect(server2.resolvedUrls?.local?.[0]).not.toBe(
			server1.resolvedUrls?.local?.[0]
		);

		await setupDevTunnel(server2, ctx, tunnelManager);

		expect(ctx.getTunnelHostnames()).toEqual(["bar.trycloudflare.com"]);
		expect(restart2).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenCalledTimes(2);
		expect(startTunnel).toHaveBeenNthCalledWith(2, {
			origin: new URL(server2.resolvedUrls?.local?.[0] ?? ""),
			extendHint: "Press t + enter to extend by 1 hour.",
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});
	});

	it("rejects tunnel sharing in middleware mode", async ({ expect }) => {
		const server = { httpServer: null } as unknown as vite.ViteDevServer;

		await expect(resolveDevTunnelOrigin(server)).rejects.toThrow(
			"No HTTP server available for tunnel sharing. Tunnels are not supported in middleware mode."
		);
	});

	it("rejects when disposing the previous tunnel fails", async ({ expect }) => {
		const disposeError = new Error("dispose failed");
		vi.mocked(startTunnel)
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					mode: "quick",
					publicUrl: new URL("https://foo.trycloudflare.com"),
				}),
				extendExpiry: vi.fn(),
				dispose: vi.fn(() => {
					throw disposeError;
				}),
			})
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					mode: "quick",
					publicUrl: new URL("https://bar.trycloudflare.com"),
				}),
				extendExpiry: vi.fn(),
				dispose: vi.fn().mockResolvedValue(undefined),
			});

		const server = await createServer();
		const tunnelManager = new TunnelManager(server.config.logger);

		onTestFinished(() => server.close());

		await tunnelManager.startTunnel("http://localhost:3000");

		await expect(
			tunnelManager.startTunnel("http://localhost:3001")
		).rejects.toMatchObject({
			message: "Failed to start tunnel: dispose failed",
			cause: disposeError,
		});

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(tunnelManager.publicUrl).toBeUndefined();
	});

	it("rejects server.listen when tunnel startup fails", async ({ expect }) => {
		const tunnelError = new Error("quick tunnel rate limited");
		const disposeError = new Error("failed to dispose tunnel");
		const server = await createServer();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});

		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockRejectedValue(tunnelError),
			extendExpiry: vi.fn(),
			dispose: vi.fn(() => {
				throw disposeError;
			}),
		});
		Object.defineProperty(ctx, "resolvedPluginConfig", {
			value: {
				type: "workers",
				tunnel: true,
			},
		});

		const plugin = tunnelPlugin(ctx);
		const close = vi.spyOn(server, "close");

		onTestFinished(() => server.close());

		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configureServer(server);

		await expect(() => server.listen(0)).rejects.toMatchObject({
			message: "Failed to start tunnel: quick tunnel rate limited",
			cause: tunnelError,
		});
		expect(close).toHaveBeenCalledTimes(1);
		expect(server.httpServer?.listening).toBe(false);
	});

	it("fails preview startup when tunnel startup fails", async ({ expect }) => {
		const tunnelError = new Error("quick tunnel rate limited");
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockRejectedValue(tunnelError),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const previewServer = await preview();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		Object.defineProperty(ctx, "resolvedPluginConfig", {
			value: {
				type: "preview",
				tunnel: true,
			},
		});

		onTestFinished(() => previewServer.close());

		const plugin = tunnelPlugin(ctx);

		await expect(
			// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
			plugin.configurePreviewServer(previewServer)
		).rejects.toMatchObject({
			message: "Failed to start tunnel: quick tunnel rate limited",
			cause: tunnelError,
		});
	});

	it("prints tunnel details with server.printUrls", async ({ expect }) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "quick",
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			extendExpiry: vi.fn(),
			dispose: vi.fn().mockResolvedValue(undefined),
		});

		const server = await createServer();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		Object.defineProperty(ctx, "resolvedPluginConfig", {
			value: {
				type: "workers",
				tunnel: true,
			},
		});

		const plugin = tunnelPlugin(ctx);
		vi.spyOn(server, "restart").mockResolvedValue();

		onTestFinished(() => server.close());

		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configureServer(server);
		await server.listen(0);

		const info = vi
			.spyOn(server.config.logger, "info")
			.mockReturnValue(undefined);
		const warnOnce = vi
			.spyOn(server.config.logger, "warnOnce")
			.mockReturnValue(undefined);

		server.printUrls();

		const infoLog = info.mock.calls
			.map(([message]) => stripVTControlCharacters(message))
			.join("\n");

		expect(infoLog).toContain("Tunnel:  https://example.trycloudflare.com/");
		expect(warnOnce).toHaveBeenCalledWith(DEV_PUBLIC_EXPOSURE_WARNING);
	});

	it("prints preview tunnel warning without dev-only caveats", async ({
		expect,
	}) => {
		const previewServer = await preview();
		const infoMock = vi
			.spyOn(previewServer.config.logger, "info")
			.mockReturnValue(undefined);
		const warnOnceMock = vi
			.spyOn(previewServer.config.logger, "warnOnce")
			.mockReturnValue(undefined);

		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		Object.defineProperty(ctx, "resolvedPluginConfig", {
			value: {
				type: "preview",
				tunnel: true,
			},
		});

		const plugin = tunnelPlugin(ctx);

		onTestFinished(() => previewServer.close());

		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configurePreviewServer(previewServer);

		previewServer.printUrls();

		const infoLog = infoMock.mock.calls
			.map(([message]) => stripVTControlCharacters(message))
			.join("\n");

		expect(infoLog).toContain("Tunnel:  https://example.trycloudflare.com/");
		expect(warnOnceMock).toHaveBeenCalledWith(PREVIEW_PUBLIC_EXPOSURE_WARNING);
	});

	it("starts a preview tunnel with the resolved preview port", async ({
		expect,
	}) => {
		const previewServer = await preview();
		const tunnelManager = new TunnelManager(
			previewServer.config.logger as vite.Logger
		);

		onTestFinished(() => previewServer.close());

		await setupPreviewTunnel(previewServer, tunnelManager);

		const startTunnelCall = vi.mocked(startTunnel).mock.calls[0]?.[0];
		expect(startTunnelCall).toMatchObject({
			extendHint: "Press t + enter to extend by 1 hour.",
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});
		expect(startTunnelCall?.origin).toBeInstanceOf(URL);
		expect(startTunnelCall?.origin.hostname).toBe("localhost");
		expect(startTunnelCall?.origin.port).toBe(
			String(previewServer.config.preview.port)
		);
		expect(previewServer.config.preview.strictPort).toBe(true);
	});
});
