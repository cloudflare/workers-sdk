import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { useDispose, useTmp } from "../../test-shared";

// Minimal worker script. When assets are configured, all incoming `dispatchFetch`
// requests are automatically routed through the assets router service, which
// either serves a matched asset (200) or returns 404 (because `has_user_worker`
// defaults to false, so unmatched paths go straight to the asset worker's 404).
const WORKER_SCRIPT = `export default {
	async fetch(request, env) {
		return new Response("from user worker");
	}
}`;

function makeOptions(directory: string) {
	return {
		modules: true,
		script: WORKER_SCRIPT,
		compatibilityDate: "2024-07-31",
		assets: { directory },
	};
}

test("starts without error when assets directory does not exist", async ({
	expect,
}) => {
	const tmp = await useTmp();
	// Create a path that does not exist on disk
	const nonExistentDir = path.join(tmp, "does-not-exist");

	// Should not throw even though the directory is absent
	const mf = new Miniflare(makeOptions(nonExistentDir));
	useDispose(mf);

	// Empty manifest → asset not found → 404
	const res = await mf.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(404);
	await res.arrayBuffer(); // consume body to avoid leaks
});

test("starts without error when assets directory is empty", async ({
	expect,
}) => {
	// useTmp() creates the directory for us; we leave it empty
	const tmp = await useTmp();

	const mf = new Miniflare(makeOptions(tmp));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(404);
	await res.arrayBuffer();
});

test("serves files from assets directory", async ({ expect }) => {
	const tmp = await useTmp();
	await fs.writeFile(path.join(tmp, "test.txt"), "hello from asset");

	const mf = new Miniflare(makeOptions(tmp));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello from asset");
});

// ─── Watch / reload behaviour ────────────────────────────────────────────────

// This test simulates what happens during `wrangler dev` when the assets
// directory does not exist at startup but it is created afterwards
test("serves new assets after setOptions() once the directory is created", async ({
	expect,
}) => {
	const tmp = await useTmp();
	// The assets directory does not exist yet (build hasn't run)
	const assetsDir = path.join(tmp, "dist");

	const mf = new Miniflare(makeOptions(assetsDir));
	useDispose(mf);

	// Initially no assets → 404
	const res1 = await mf.dispatchFetch("http://example.com/index.html");
	expect(res1.status).toBe(404);
	await res1.arrayBuffer();

	// Create assets directory
	await fs.mkdir(assetsDir, { recursive: true });
	await fs.writeFile(path.join(assetsDir, "index.html"), "<h1>Hello!</h1>");

	// Simulate wrangler's reaction to chokidar detecting the new directory:
	// it calls setOptions() which re-invokes getServices() on all plugins,
	// re-walks the assets directory, and rebuilds the manifest.
	await mf.setOptions(makeOptions(assetsDir));

	// The asset should now be served
	const res2 = await mf.dispatchFetch("http://example.com/index.html");
	expect(res2.status).toBe(200);
	expect(await res2.text()).toContain("<h1>Hello!</h1>");
});
