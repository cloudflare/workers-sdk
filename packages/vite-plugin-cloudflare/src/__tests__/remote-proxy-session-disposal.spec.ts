import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { createBuilder, preview } from "vite";
import { describe, expect, test, vi } from "vitest";
import { cloudflare } from "../index";
import type { RemoteProxySessionData } from "@cloudflare/remote-bindings";
import type { RemoteProxyConnectionString } from "miniflare";

vi.mock("@cloudflare/remote-bindings", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@cloudflare/remote-bindings")>();
	return {
		...actual,
		maybeStartOrUpdateRemoteProxySession: vi.fn(),
	};
});

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

/**
 * Stands in for the remote proxy session a real `startRemoteProxySession`
 * would return, since starting a real one requires Cloudflare credentials
 * and network access. What matters for this bug is whether its `dispose()`
 * is ever called.
 */
function mockRemoteProxySessionData(): RemoteProxySessionData {
	return {
		session: {
			ready: Promise.resolve(),
			dispose: vi.fn(async () => {}),
			updateBindings: vi.fn(),
			remoteProxyConnectionString: "http://127.0.0.1:12345" as RemoteProxyConnectionString,
		},
		remoteBindings: {},
	};
}

describe("remote proxy session disposal", () => {
	test("disposes the remote proxy session when the preview server closes", async ({
		expect,
	}) => {
		const sessionData = mockRemoteProxySessionData();
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockImplementation(
			async () => sessionData
		);

		// `vite build` runs the prerender pass through a preview server, so
		// exercise the same path: build, then start and close a preview server
		// with remote bindings enabled.
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
		await builder.buildApp();

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

		try {
			const url = previewServer.resolvedUrls?.local[0];
			assert(url);
			expect(await (await fetch(url)).text()).toBe("Hello World!");
			expect(sessionData.session.dispose).not.toHaveBeenCalled();
		} finally {
			await previewServer.close();
		}

		// The preview server only exists to serve the prerender pass during a
		// build, so its remote proxy session must be disposed when it closes.
		// Otherwise the proxy's listening server keeps the process alive and
		// `vite build` never exits.
		expect(sessionData.session.dispose).toHaveBeenCalledTimes(1);
	});
});
