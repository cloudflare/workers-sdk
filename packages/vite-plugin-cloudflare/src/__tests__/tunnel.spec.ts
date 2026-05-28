import { stripVTControlCharacters } from "node:util";
import { startTunnel } from "@cloudflare/workers-utils";
import { createDeferred } from "@cloudflare/workers-utils/test-helpers";
import { createServer, preview } from "vite";
import {
	afterEach,
	beforeEach,
	describe,
	it,
	onTestFinished,
	vi,
} from "vitest";
import * as wrangler from "wrangler";
import { PluginContext } from "../context";
import {
	QUICK_TUNNEL_ALLOWED_HOST,
	resolveDevTunnelOrigin,
	setupPreviewTunnel,
	TunnelManager,
	toggleTunnel,
	setupDevTunnel,
	tunnelPlugin,
} from "../plugins/tunnel";
import type { TunnelConfig } from "../plugin-config";
import type * as vite from "vite";

vi.mock("@cloudflare/workers-utils");
vi.mock("wrangler");

function createMockPluginContext(options: {
	type: "workers" | "preview";
	tunnel?: TunnelConfig;
	account_id?: string;
}) {
	const ctx = new PluginContext({
		hasShownWorkerConfigWarnings: false,
		restartingDevServerCount: 0,
		tunnelHostnames: new Set(),
	});
	Object.defineProperty(ctx, "resolvedPluginConfig", {
		value: {
			type: options.type,
			tunnel: {
				autoStart: options.tunnel?.autoStart ?? false,
				name: options.tunnel?.name,
			},
		},
	});
	if (options.type === "workers") {
		Object.defineProperty(ctx, "entryWorkerConfig", {
			value: {
				account_id: options.account_id,
			},
		});
	}
	Object.defineProperty(ctx, "allWorkerConfigs", {
		value: [
			{
				account_id: options.account_id,
			},
		],
	});
	return ctx;
}

describe("tunnel plugin", () => {
	beforeEach(() => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "quick",
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			isOpen: vi.fn(() => true),
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
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const server = await createServer();
		const ctx = createMockPluginContext({
			type: "workers",
			tunnel: { autoStart: true },
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
			token: undefined,
			extendHint: "Press a + enter to extend by 1 hour.",
			logger: expect.objectContaining({
				log: expect.any(Function),
				warn: expect.any(Function),
				debug: expect.any(Function),
			}),
		});
		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
		expect(tunnelManager.publicUrls).toEqual([
			"https://example.trycloudflare.com/",
		]);

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
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const server = await createServer();
		const ctx = createMockPluginContext({
			type: "workers",
			tunnel: { autoStart: true },
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
				isOpen: vi.fn(() => true),
				extendExpiry: vi.fn(),
				dispose: vi.fn(),
			})
			.mockReturnValueOnce({
				ready: vi.fn().mockResolvedValue({
					mode: "quick",
					publicUrl: new URL("https://bar.trycloudflare.com"),
				}),
				isOpen: vi.fn(() => true),
				extendExpiry: vi.fn(),
				dispose: vi.fn(),
			});

		const server1 = await createServer();
		const ctx = createMockPluginContext({
			type: "workers",
			tunnel: { autoStart: true },
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
			token: undefined,
			extendHint: "Press a + enter to extend by 1 hour.",
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
			token: undefined,
			extendHint: "Press a + enter to extend by 1 hour.",
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
				isOpen: vi.fn(() => true),
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
				isOpen: vi.fn(() => true),
				extendExpiry: vi.fn(),
				dispose: vi.fn().mockResolvedValue(undefined),
			});

		const server = await createServer();
		const tunnelManager = new TunnelManager(server.config.logger);

		onTestFinished(() => server.close());

		await tunnelManager.startTunnel({
			origin: "http://localhost:3000",
			name: undefined,
			mode: "dev",
			allowedHosts: true,
			accountId: undefined,
			complianceRegion: undefined,
		});

		await expect(
			tunnelManager.startTunnel({
				origin: "http://localhost:3001",
				name: undefined,
				mode: "dev",
				allowedHosts: true,
				accountId: undefined,
				complianceRegion: undefined,
			})
		).rejects.toBe(disposeError);

		expect(startTunnel).toHaveBeenCalledTimes(1);
		expect(tunnelManager.publicUrls).toBeUndefined();
	});

	it("rejects server.listen when tunnel startup fails", async ({ expect }) => {
		const tunnelError = new Error("quick tunnel rate limited");
		const disposeError = new Error("failed to dispose tunnel");
		const server = await createServer();
		const ctx = createMockPluginContext({
			type: "workers",
			tunnel: { autoStart: true },
		});

		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockRejectedValue(tunnelError),
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn(() => {
				throw disposeError;
			}),
		});
		const plugin = tunnelPlugin(ctx);
		const close = vi.spyOn(server, "close");

		onTestFinished(() => server.close());

		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configureServer(server);

		await expect(() => server.listen(0)).rejects.toBe(tunnelError);
		expect(close).toHaveBeenCalledTimes(1);
		expect(server.httpServer?.listening).toBe(false);
	});

	it("fails preview startup when tunnel startup fails", async ({ expect }) => {
		const tunnelError = new Error("quick tunnel rate limited");
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockRejectedValue(tunnelError),
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const previewServer = await preview({
			preview: {
				allowedHosts: [QUICK_TUNNEL_ALLOWED_HOST],
			},
		});
		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: true },
		});

		onTestFinished(() => previewServer.close());

		const plugin = tunnelPlugin(ctx);

		await expect(
			// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
			plugin.configurePreviewServer(previewServer)
		).rejects.toBe(tunnelError);
	});

	it("fails preview startup for a quick tunnel when preview.allowedHosts is missing", async ({
		expect,
	}) => {
		const previewServer = await preview();
		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: true },
		});

		onTestFinished(() => previewServer.close());

		const plugin = tunnelPlugin(ctx);

		await expect(
			// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
			plugin.configurePreviewServer(previewServer)
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: Quick tunnel hostnames are not allowed by Vite preview host validation.
			Add \`.trycloudflare.com\` to \`preview.allowedHosts\` in your Vite config.
			]
		`);
	});

	it("prints tunnel details with server.printUrls", async ({ expect }) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "quick",
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn().mockResolvedValue(undefined),
		});

		const server = await createServer();
		const ctx = createMockPluginContext({
			type: "workers",
			tunnel: { autoStart: true },
		});
		const info = vi
			.spyOn(server.config.logger, "info")
			.mockReturnValue(undefined);

		const plugin = tunnelPlugin(ctx);
		vi.spyOn(server, "restart").mockResolvedValue();

		onTestFinished(() => server.close());

		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configureServer(server);
		await server.listen(0);

		server.printUrls();

		const infoLog = info.mock.calls
			.map(([message]) => stripVTControlCharacters(message))
			.join("\n");

		expect(infoLog).toContain("Tunnel:  https://example.trycloudflare.com/");
	});

	it("prints preview tunnel warning without dev-only caveats", async ({
		expect,
	}) => {
		const previewServer = await preview({
			preview: {
				allowedHosts: [QUICK_TUNNEL_ALLOWED_HOST],
			},
		});
		const infoMock = vi
			.spyOn(previewServer.config.logger, "info")
			.mockReturnValue(undefined);

		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: true },
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
	});

	it("starts a preview tunnel with the resolved preview port", async ({
		expect,
	}) => {
		const previewServer = await preview({
			preview: {
				allowedHosts: [QUICK_TUNNEL_ALLOWED_HOST],
			},
		});
		const tunnelManager = new TunnelManager(
			previewServer.config.logger as vite.Logger
		);
		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: true },
		});

		onTestFinished(() => previewServer.close());

		await setupPreviewTunnel(previewServer, ctx, tunnelManager);

		const startTunnelCall = vi.mocked(startTunnel).mock.calls[0]?.[0];
		expect(startTunnelCall).toMatchObject({
			extendHint: "Press a + enter to extend by 1 hour.",
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

	it("starts a named preview tunnel and keeps only allowed hosts", async ({
		expect,
	}) => {
		vi.mocked(wrangler.unstable_resolveNamedTunnel).mockResolvedValue({
			hostnames: [
				"dev.example.com",
				"preview.example.com",
				"something-else.com",
			],
			token: "TOKEN",
		});
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "named",
			}),
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const previewServer = await preview({
			preview: {
				allowedHosts: [".example.com"],
			},
		});
		const tunnelManager = new TunnelManager(
			previewServer.config.logger as vite.Logger
		);
		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: true, name: "my-tunnel" },
			account_id: "account-id",
		});

		onTestFinished(() => previewServer.close());

		await setupPreviewTunnel(previewServer, ctx, tunnelManager);

		expect(wrangler.unstable_resolveNamedTunnel).toHaveBeenCalledWith(
			"my-tunnel",
			expect.any(URL),
			{
				accountId: "account-id",
				complianceRegion: undefined,
			}
		);
		expect(tunnelManager.publicUrls).toEqual([
			"https://dev.example.com",
			"https://preview.example.com",
		]);
	});

	it("throws when no named preview tunnel hosts are allowed", async ({
		expect,
	}) => {
		vi.mocked(wrangler.unstable_resolveNamedTunnel).mockResolvedValue({
			hostnames: ["dev.example.com", "preview.example.com"],
			token: "TOKEN",
		});
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				mode: "named",
			}),
			isOpen: vi.fn(() => true),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const previewServer = await preview();
		const tunnelManager = new TunnelManager(
			previewServer.config.logger as vite.Logger
		);
		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: true, name: "my-tunnel" },
			account_id: "account-id",
		});

		onTestFinished(() => previewServer.close());

		await expect(setupPreviewTunnel(previewServer, ctx, tunnelManager)).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: The resolved tunnel hostnames are not allowed by Vite preview host validation.

			Add at least one of these hosts to \`preview.allowedHosts\` in your Vite config.
			You can use exact hostnames or a domain suffix:
			  - dev.example.com
			  - preview.example.com
			  - .example.com
			]
		`);
	});

	it("cancels a named tunnel that is closed while still starting", async ({
		expect,
	}) => {
		const namedTunnelDeferred = createDeferred<{
			hostnames: string[];
			token: string;
		}>();
		vi.mocked(wrangler.unstable_resolveNamedTunnel).mockReturnValue(
			namedTunnelDeferred.promise
		);

		const server = await createServer();
		const tunnelManager = new TunnelManager(server.config.logger);

		onTestFinished(() => server.close());

		const startPromise = tunnelManager.startTunnel({
			origin: "http://localhost:3000",
			name: "my-tunnel",
			mode: "dev",
			allowedHosts: true,
			accountId: "account-id",
			complianceRegion: undefined,
		});

		expect(tunnelManager.isOpen()).toBe(true);
		tunnelManager.dispose();

		namedTunnelDeferred.resolve({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
		});

		await expect(startPromise).resolves.toBeNull();
		expect(startTunnel).not.toHaveBeenCalled();
		expect(tunnelManager.isOpen()).toBe(false);
	});

	it("logs tunnel closed only after tunnel startup begins", async ({
		expect,
	}) => {
		const namedTunnelDeferred = createDeferred<{
			hostnames: string[];
			token: string;
		}>();
		vi.mocked(wrangler.unstable_resolveNamedTunnel).mockReturnValue(
			namedTunnelDeferred.promise
		);

		const server = await createServer();
		const tunnelManager = new TunnelManager(server.config.logger);
		const info = vi
			.spyOn(server.config.logger, "info")
			.mockReturnValue(undefined);
		const getInfoLogs = () =>
			info.mock.calls
				.map(([message]) => stripVTControlCharacters(message))
				.join("\n");

		onTestFinished(() => server.close());

		tunnelManager.dispose();
		expect(getInfoLogs()).not.toContain("Tunnel closed");

		const startPromise = tunnelManager.startTunnel({
			origin: "http://localhost:3000",
			name: "my-tunnel",
			mode: "dev",
			allowedHosts: true,
			accountId: "account-id",
			complianceRegion: undefined,
		});

		tunnelManager.dispose();

		namedTunnelDeferred.resolve({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
		});

		await expect(startPromise).resolves.toBeNull();
		expect(startTunnel).not.toHaveBeenCalled();
		expect(getInfoLogs()).toContain("Tunnel closed");
	});

	it("does not auto-start when the tunnel is configured but disabled", async ({
		expect,
	}) => {
		const previewServer = await preview();
		const ctx = createMockPluginContext({
			type: "preview",
			tunnel: { autoStart: false, name: "my-tunnel" },
		});

		onTestFinished(() => previewServer.close());

		const plugin = tunnelPlugin(ctx);
		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configurePreviewServer(previewServer);

		expect(startTunnel).not.toHaveBeenCalled();
	});

	it("allows starting a quick tunnel from the shortcut without tunnel config when preview allows the host", async ({
		expect,
	}) => {
		const previewServer = await preview({
			preview: {
				allowedHosts: [QUICK_TUNNEL_ALLOWED_HOST],
			},
		});
		const ctx = createMockPluginContext({ type: "preview" });
		const plugin = tunnelPlugin(ctx);

		onTestFinished(() => previewServer.close());

		// @ts-expect-error The tunnel plugin accepts a server instance directly without relying on `this`
		await plugin.configurePreviewServer(previewServer);

		expect(startTunnel).not.toHaveBeenCalled();

		await toggleTunnel(previewServer, ctx);

		expect(startTunnel).toHaveBeenCalled();
	});
});
