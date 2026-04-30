import { fileURLToPath } from "node:url";
import { startTunnel } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { createBuilder, preview } from "vite";
import { afterEach, describe, onTestFinished, test, vi } from "vitest";
import { cloudflare } from "../index";

vi.mock("@cloudflare/workers-utils");

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("preview server", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	test("disposes Miniflare when preview server is closed", async ({
		expect,
	}) => {
		const disposeSpy = vi.spyOn(Miniflare.prototype, "dispose");
		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
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

		expect(disposeSpy).not.toHaveBeenCalled();
		await previewServer.close();
		expect(disposeSpy).toHaveBeenCalled();
	});

	test("allows quick tunnel hosts in preview without widening other hosts", async ({
		expect,
	}) => {
		vi.mocked(startTunnel).mockReturnValue({
			ready: vi.fn().mockResolvedValue({
				publicUrl: new URL("https://example.trycloudflare.com"),
			}),
			extendExpiry: vi.fn(),
			dispose: vi.fn(),
		});

		const plugin = cloudflare({
			inspectorPort: false,
			persistState: false,
			tunnel: true,
		});
		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [plugin],
		});

		// Build the worker
		await builder.buildApp();

		const previewServer = await preview({
			root: fixturesPath,
			logLevel: "silent",
			preview: { port: 0 },
			plugins: [plugin],
		});

		onTestFinished(() => previewServer.close());

		expect(previewServer.config.preview?.allowedHosts).toEqual([
			".trycloudflare.com",
		]);
	});
});
