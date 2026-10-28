import * as fs from "node:fs";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getPlatformProxy } from "../api";
import { mockConsoleMethods } from "./helpers/mock-console";
import type { Miniflare } from "miniflare";

/**
 * `getPlatformProxy()` doesn't expose the Miniflare instance it creates or the
 * port its HTTP entry listener is bound to. Capture the instances it creates
 * so tests can fetch from the entry listener directly, which is where a
 * missing-asset request recursively re-enters the proxy.
 */
const miniflareInstances = vi.hoisted(() => [] as Miniflare[]);

vi.mock("miniflare", async (importOriginal) => {
	const actual = await importOriginal<typeof import("miniflare")>();
	class MiniflareSpy extends actual.Miniflare {
		constructor(...args: ConstructorParameters<typeof actual.Miniflare>) {
			super(...args);
			miniflareInstances.push(this);
		}
	}
	return { ...actual, Miniflare: MiniflareSpy };
});

describe("getPlatformProxy() assets", () => {
	runInTempDir();
	mockConsoleMethods();

	let disposeProxy: (() => Promise<void>) | undefined;

	beforeEach(() => {
		miniflareInstances.length = 0;
		disposeProxy = undefined;
	});

	afterEach(async () => {
		await disposeProxy?.();
	});

	/**
	 * Writes a config resembling the one SvelteKit's adapter-cloudflare
	 * generates for `getPlatformProxy()`: a Worker with `main` set plus an
	 * assets binding, so the asset router falls back to the user worker on
	 * asset misses.
	 */
	function setupAssetsProject() {
		fs.mkdirSync("public", { recursive: true });
		fs.writeFileSync("public/index.html", "<h1>hello from assets</h1>");
		fs.writeFileSync("index.js", "export default {};\n");
		writeWranglerConfig(
			{
				name: "test-worker",
				main: "index.js",
				compatibility_date: "2026-10-01",
				assets: {
					binding: "ASSETS",
					directory: "public",
				},
			},
			"./wrangler.json"
		);
	}

	async function startPlatformProxy() {
		const { dispose } = await getPlatformProxy({
			configPath: "./wrangler.json",
		});
		disposeProxy = dispose;
		const miniflare = miniflareInstances.at(-1);
		if (miniflare === undefined) {
			throw new Error("expected getPlatformProxy() to create a Miniflare");
		}
		return miniflare.ready;
	}

	it("serves existing assets on the entry listener", async ({ expect }) => {
		setupAssetsProject();
		const entryUrl = await startPlatformProxy();

		const response = await fetch(new URL("/index.html", entryUrl), {
			signal: AbortSignal.timeout(10_000),
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<h1>hello from assets</h1>");
	});

	it("terminates requests for missing assets instead of recursively connecting to its own entry listener", async ({
		expect,
	}) => {
		setupAssetsProject();
		const entryUrl = await startPlatformProxy();

		// The platform proxy doesn't run the application's Worker — the worker
		// backing these bindings is an empty script, while the asset router
		// still falls back to it on misses (because `main` is configured).
		// Receiving a request is workerd's default behaviour for a worker with
		// no fetch handler: it forwards the request to the URL's origin, which
		// is this proxy's own entry listener, so every miss re-enters the same
		// route and accumulates connections until workerd runs out of file
		// descriptors (cloudflare/workers-sdk#16558). A miss must instead
		// terminate with a bounded response.
		const response = await fetch(new URL("/missing-probe", entryUrl), {
			signal: AbortSignal.timeout(2_000),
		});

		expect(response.status).toBe(404);
	});
});
