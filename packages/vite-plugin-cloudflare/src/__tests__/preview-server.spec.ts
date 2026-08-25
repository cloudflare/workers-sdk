import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { getZoneFromRoute } from "@cloudflare/workers-utils";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { Miniflare } from "miniflare";
import { createBuilder, preview } from "vite";
import { afterEach, describe, test, vi } from "vitest";
import { cloudflare } from "../index";
import type { RemoteProxySession } from "@cloudflare/remote-bindings";

vi.mock("@cloudflare/workers-utils");

vi.mock("@cloudflare/remote-bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/remote-bindings")>()),
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("preview server", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	test.for([
		{ domain: undefined, expectedHostname: undefined },
		{ domain: "example.com", expectedHostname: "example.com" },
		{
			domain: {
				hostname: "previews.example.com",
				production: false,
				previews: true,
			},
			expectedHostname: "previews.example.com",
		},
	])(
		"serves a Worker with domain %j and disposes Miniflare when closed",
		async ({ domain, expectedHostname }, { expect }) => {
			const actual = await vi.importActual<
				typeof import("@cloudflare/workers-utils")
			>("@cloudflare/workers-utils");
			vi.mocked(getZoneFromRoute).mockImplementation(actual.getZoneFromRoute);
			const disposeSpy = vi.spyOn(Miniflare.prototype, "dispose");
			const builder = await createBuilder({
				root: fixturesPath,
				logLevel: "silent",
				plugins: [
					cloudflare({
						inspectorPort: false,
						persistState: false,
						config: { domains: domain === undefined ? undefined : [domain] },
					}),
				],
			});

			// Build the worker
			await builder.buildApp();

			// Start a preview server
			const previewServer = await preview({
				root: fixturesPath,
				logLevel: "silent",
				preview: { port: 0 },
				plugins: [cloudflare({ inspectorPort: false, persistState: false })],
			});

			try {
				const url = previewServer.resolvedUrls?.local[0];
				assert(url);
				expect(await (await fetch(url)).text()).toBe("Hello World!");
				if (expectedHostname === undefined) {
					expect(getZoneFromRoute).not.toHaveBeenCalled();
				} else {
					expect(getZoneFromRoute).toHaveBeenCalledWith(expectedHostname);
				}
				expect(disposeSpy).not.toHaveBeenCalled();
			} finally {
				await previewServer.close();
			}
			expect(disposeSpy).toHaveBeenCalled();
		}
	);

	test("disposes the remote proxy session when preview server is closed", async ({
		expect,
	}) => {
		const dispose = vi.fn(async () => {});

		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session: {
				ready: Promise.resolve(),
				dispose,
				updateBindings: async () => {},
				remoteProxyConnectionString:
					"http://127.0.0.1:1234" as unknown as RemoteProxySession["remoteProxyConnectionString"],
			},
			remoteBindings: {},
		});

		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					remoteBindings: true,
				}),
			],
		});

		// Build the worker
		await builder.buildApp();

		// Start a preview server
		const previewServer = await preview({
			root: fixturesPath,
			logLevel: "silent",
			preview: { port: 0 },
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					remoteBindings: true,
				}),
			],
		});

		expect(dispose).not.toHaveBeenCalled();
		// The session holds a listening server handle, so leaving it open keeps
		// the event loop alive and `vite build` never exits
		await previewServer.close();
		expect(dispose).toHaveBeenCalled();
	});

	test("retries remote proxy session dispose after a failed close", async ({
		expect,
	}) => {
		const dispose = vi
			.fn()
			.mockRejectedValueOnce(new Error("dispose failed"))
			.mockResolvedValue(undefined);

		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session: {
				ready: Promise.resolve(),
				dispose,
				updateBindings: async () => {},
				remoteProxyConnectionString:
					"http://127.0.0.1:1234" as unknown as RemoteProxySession["remoteProxyConnectionString"],
			},
			remoteBindings: {},
		});

		const plugins = [
			cloudflare({
				inspectorPort: false,
				persistState: false,
				remoteBindings: true,
			}),
		];

		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins,
		});
		await builder.buildApp();

		const firstPreview = await preview({
			root: fixturesPath,
			logLevel: "silent",
			preview: { port: 0 },
			plugins,
		});

		await expect(firstPreview.close()).resolves.toBeUndefined();
		expect(dispose).toHaveBeenCalledTimes(1);

		const secondPreview = await preview({
			root: fixturesPath,
			logLevel: "silent",
			preview: { port: 0 },
			plugins,
		});

		const lastStart = vi
			.mocked(maybeStartOrUpdateRemoteProxySession)
			.mock.calls.at(-1);
		expect(lastStart?.[1]).toEqual(
			expect.objectContaining({
				session: expect.objectContaining({ dispose }),
			})
		);

		await secondPreview.close();
		expect(dispose).toHaveBeenCalledTimes(2);
	});
});
