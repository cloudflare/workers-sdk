import { stripVTControlCharacters } from "node:util";
import { startTunnel } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { afterEach, describe, it, onTestFinished, vi } from "vitest";
import { PluginContext } from "../context";
import {
	PUBLIC_EXPOSURE_WARNING,
	TunnelManager,
	setupTunnel,
	tunnelPlugin,
} from "../plugins/tunnel";

vi.mock("@cloudflare/workers-utils");

describe("tunnel plugin", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("starts a tunnel after the server starts listening", async ({
		expect,
	}) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
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
		await setupTunnel(server, ctx, tunnelManager);

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
		await setupTunnel(server, ctx, tunnelManager);

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(restart).toHaveBeenCalledTimes(1);
		restart.mockClear();

		await server.restart();

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(restart).toHaveBeenCalledTimes(1);
		restart.mockClear();

		await setupTunnel(server, ctx, tunnelManager);

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(restart).not.toHaveBeenCalled();
	});

	it("starts a new tunnel when the origin changes", async ({ expect }) => {
		vi.mocked(startTunnel)
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					publicUrl: new URL("https://foo.trycloudflare.com"),
				}),
				extendExpiry: vi.fn(),
				dispose: vi.fn(),
			})
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
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
		await setupTunnel(server1, ctx, tunnelManager);

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

		await setupTunnel(server2, ctx, tunnelManager);

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

	it("rejects server.listen when tunnel startup fails", async ({ expect }) => {
		const tunnelError = new Error("quick tunnel rate limited");
		const server = await createServer();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});

		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockRejectedValue(tunnelError),
			extendExpiry: vi.fn(),
			dispose: vi.fn().mockResolvedValue(undefined),
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
	});

	it("prints tunnel details with server.printUrls", async ({ expect }) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
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
		expect(warnOnce).toHaveBeenCalledWith(PUBLIC_EXPOSURE_WARNING);
	});
});
