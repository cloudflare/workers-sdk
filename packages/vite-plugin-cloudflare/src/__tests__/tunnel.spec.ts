import { stripVTControlCharacters } from "node:util";
import { startTunnel } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { afterEach, describe, it, onTestFinished, vi } from "vitest";
import { PluginContext } from "../context";
import {
	PUBLIC_EXPOSURE_WARNING,
	TunnelManager,
	setupTunnel,
} from "../plugins/tunnel";

vi.mock("@cloudflare/workers-utils");

describe("setupViteTunnel", () => {
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
		const warn = vi
			.spyOn(server.config.logger, "warn")
			.mockReturnValue(undefined);
		const error = vi
			.spyOn(server.config.logger, "error")
			.mockReturnValue(undefined);

		onTestFinished(() => server.close());

		await server.listen(0);
		const publicURL = await setupTunnel(server, ctx, tunnelManager);

		expect(publicURL).toBe("https://example.trycloudflare.com/");
		expect(ctx.tunnelHostnames).toEqual(new Set(["example.trycloudflare.com"]));
		expect(restart).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenCalledWith({
			origin: new URL(server.resolvedUrls?.local?.[0] ?? ""),
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});
		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
		const infoMessages = info.mock.calls.map(([message]) =>
			stripVTControlCharacters(message)
		);
		expect(infoMessages).toContain(
			"  ➜  Starting tunnel (usually takes 5-15s)..."
		);
		expect(infoMessages).toContain(
			"  ➜  Tunnel:  https://example.trycloudflare.com/"
		);
		expect(warn).toHaveBeenCalledWith(PUBLIC_EXPOSURE_WARNING);
	});

	it("reuses the same tunnel when the origin is unchanged", async ({
		expect,
	}) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
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
				dispose: vi.fn(),
			})
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					publicUrl: new URL("https://bar.trycloudflare.com"),
				}),
				dispose: vi.fn(),
			});

		const server1 = await createServer();
		const tunnelHostnames = new Set<string>();
		const ctx = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
			tunnelHostnames,
		});
		const tunnelManager = new TunnelManager(server1.config.logger);
		const restart1 = vi.spyOn(server1, "restart").mockResolvedValue();
		onTestFinished(() => server1.close());

		await server1.listen(0);
		await setupTunnel(server1, ctx, tunnelManager);

		expect(tunnelHostnames).toEqual(new Set(["foo.trycloudflare.com"]));
		expect(restart1).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenNthCalledWith(1, {
			origin: new URL(server1.resolvedUrls?.local?.[0] ?? ""),
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

		expect(tunnelHostnames).toEqual(new Set(["bar.trycloudflare.com"]));
		expect(restart2).toHaveBeenCalledTimes(1);
		expect(startTunnel).toHaveBeenCalledTimes(2);
		expect(startTunnel).toHaveBeenNthCalledWith(2, {
			origin: new URL(server2.resolvedUrls?.local?.[0] ?? ""),
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});
	});
});
