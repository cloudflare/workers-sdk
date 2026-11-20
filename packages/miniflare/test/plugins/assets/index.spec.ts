import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import {
	convertV4MiniflareOptions,
	Miniflare,
	MiniflareCoreError,
} from "miniflare";
import { onTestFinished, test, vi } from "vitest";
import {
	disposeWithRetry,
	singleModuleManifest,
	useDispose,
	useTmp,
} from "../../test-shared";
import type { MiniflareOptions, WorkerOptions } from "miniflare";

const WORKER_SCRIPT = `export default {
	async fetch(request, env) {
		return new Response("from user worker");
	}
}`;

// An assets-only Worker (no code), so the asset router either serves a matched
// asset (200) or returns the asset Worker's 404 for unmatched paths
function makeOptions(
	directory: string,
	{ rootPath, basePath }: { rootPath?: string; basePath?: string } = {}
): MiniflareOptions {
	return {
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-04-29",
					assets: { directory, basePath },
				},
				dev: rootPath === undefined ? undefined : { rootPath },
			},
		],
	};
}

async function writeNotFoundAssets(directory: string) {
	await fs.writeFile(path.join(directory, "test.txt"), "hello from asset");
	await fs.writeFile(path.join(directory, "404.html"), "asset 404 page");
}

test("serves an assets-only Worker without code", async ({ expect }) => {
	const tmp = await useTmp();
	await writeNotFoundAssets(tmp);
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "assets-only",
					compatibilityDate: "2026-04-29",
					assets: { directory: tmp, notFoundHandling: "404-page" },
				},
			},
		],
	});
	useDispose(mf);

	let res = await mf.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello from asset");

	// Unmatched requests get the asset Worker's not-found handling
	res = await mf.dispatchFetch("http://example.com/missing");
	expect(res.status).toBe(404);
	expect(await res.text()).toBe("asset 404 page");
});

test("falls back to a Worker's code for requests without a matching asset", async ({
	expect,
}) => {
	const tmp = await useTmp();
	await writeNotFoundAssets(tmp);
	const config = {
		name: "",
		compatibilityDate: "2026-04-29",
		assets: { directory: tmp, notFoundHandling: "404-page" as const },
	};
	const workers: WorkerOptions[] = [
		{ config: { ...config, manifest: singleModuleManifest(WORKER_SCRIPT) } },
		{
			config,
			legacy: {
				serviceWorkerScript: `addEventListener("fetch", (event) => {
					event.respondWith(new Response("from user worker"));
				});`,
			},
		},
	];

	for (const worker of workers) {
		const mf = new Miniflare({ workers: [worker] });
		useDispose(mf);
		const res = await mf.dispatchFetch("http://example.com/missing");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("from user worker");
	}
});

test("serves assets-only Workers converted from v4 options without their placeholder script", async ({
	expect,
}) => {
	const tmp = await useTmp();
	await writeNotFoundAssets(tmp);
	const options = (hasUserWorker: boolean) =>
		convertV4MiniflareOptions({
			compatibilityDate: "2026-04-29",
			modules: true,
			script: WORKER_SCRIPT,
			assets: {
				directory: tmp,
				routerConfig: { has_user_worker: hasUserWorker },
				assetConfig: { not_found_handling: "404-page" },
			},
		});

	const mf = new Miniflare(options(false));
	useDispose(mf);
	let res = await mf.dispatchFetch("http://example.com/missing");
	expect(res.status).toBe(404);
	expect(await res.text()).toBe("asset 404 page");

	await mf.setOptions(options(true));
	res = await mf.dispatchFetch("http://example.com/missing");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("from user worker");
});

test("rejects a Worker with neither code nor assets", async ({
	expect,
	onTestFinished,
}) => {
	const mf = new Miniflare({
		workers: [{ config: { name: "empty", compatibilityDate: "2026-04-29" } }],
	});
	// Disposing an instance whose startup failed rethrows the startup error.
	onTestFinished(() =>
		disposeWithRetry(mf).catch((error: unknown) => {
			expect(error).toMatchObject({ code: "ERR_VALIDATION" });
		})
	);
	const ready = mf.ready;
	await expect(ready).rejects.toBeInstanceOf(MiniflareCoreError);
	await expect(ready).rejects.toMatchObject({
		code: "ERR_VALIDATION",
		message:
			'Worker "empty" has no code. Provide a `config.manifest` or `legacy.serviceWorkerScript`, or `config.assets` for an assets-only Worker.',
	});
});

test("omits Sentry from the embedded asset service Workers", async ({
	expect,
}) => {
	for (const worker of ["assets", "router"]) {
		for (const extension of ["js", "js.map"]) {
			const artifact = await fs.readFile(
				path.join(
					"dist",
					"src",
					"workers",
					"assets",
					`${worker}.worker.${extension}`
				),
				"utf8"
			);
			expect(artifact).not.toContain("node_modules/toucan-js");
			expect(artifact).not.toContain("node_modules/@sentry");
		}
	}
});

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

// Test files run in parallel and create their own `miniflare-*` directories in
// the shared temporary directory. Point os.tmpdir() at a directory of this
// test's own, so the leak check below only sees this test's instance. Node
// reads TMPDIR on POSIX and TEMP or TMP on Windows.
async function useIsolatedTmpdir(): Promise<void> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mf-assets-"));
	for (const name of ["TMPDIR", "TEMP", "TMP"]) {
		vi.stubEnv(name, dir);
	}
	onTestFinished(async () => {
		vi.unstubAllEnvs();
		await removeDir(dir);
	});
}

// Matches both the per-instance `miniflare-<hex>` root that holds the
// placeholder and the standalone `miniflare-assets-*` dirs an older layout
// created, so a leak of either shape fails the test.
async function listMiniflareTempDirs(): Promise<string[]> {
	const entries = await fs.readdir(os.tmpdir());
	return entries.filter((entry) => entry.startsWith("miniflare-"));
}

test("removes the placeholder for a missing assets directory on dispose", async ({
	expect,
}) => {
	await useIsolatedTmpdir();
	const before = await listMiniflareTempDirs();
	const tmp = await useTmp();
	const nonExistentDir = path.join(tmp, "does-not-exist");

	const mf = new Miniflare(makeOptions(nonExistentDir));
	try {
		const res = await mf.dispatchFetch("http://example.com/test.txt");
		expect(res.status).toBe(404);
		await res.arrayBuffer();
		// setOptions() re-runs getServices(), which must reuse the placeholder
		await mf.setOptions(makeOptions(nonExistentDir));
	} finally {
		await disposeWithRetry(mf);
	}

	const after = await listMiniflareTempDirs();
	expect(after.filter((entry) => !before.includes(entry))).toEqual([]);
});

test("disposing one instance keeps another instance's missing assets directory working", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const nonExistentDir = path.join(tmp, "does-not-exist");

	const mf1 = new Miniflare(makeOptions(nonExistentDir));
	const mf2 = new Miniflare(makeOptions(nonExistentDir));
	useDispose(mf2);
	try {
		await Promise.all([mf1.ready, mf2.ready]);
	} finally {
		await disposeWithRetry(mf1);
	}

	await mf2.setOptions(makeOptions(nonExistentDir));
	const res = await mf2.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(404);
	await res.arrayBuffer();
});

test("starts without error when assets directory is empty", async ({
	expect,
}) => {
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

test("reports an invalid .assetsignore encoding as a user validation error", async ({
	expect,
	onTestFinished,
}) => {
	const tmp = await useTmp();
	await fs.writeFile(
		path.join(tmp, ".assetsignore"),
		Buffer.from("ignored.txt", "utf16le")
	);

	const mf = new Miniflare(makeOptions(tmp));
	// Disposing an instance whose startup failed rethrows the startup error.
	onTestFinished(() =>
		disposeWithRetry(mf).catch((error: unknown) => {
			expect(error).toMatchObject({ code: "ERR_VALIDATION" });
		})
	);
	const ready = mf.ready;
	await expect(ready).rejects.toBeInstanceOf(MiniflareCoreError);
	await expect(ready).rejects.toMatchObject({
		code: "ERR_VALIDATION",
		message: expect.stringContaining("Save the file as UTF-8 and try again."),
	});
});

test("serves nested assets with encoded path names", async ({ expect }) => {
	const tmp = await useTmp();
	const directory = path.join(tmp, "nested");
	await fs.mkdir(directory);
	await fs.writeFile(path.join(directory, "[fünky].txt"), "nested asset");
	const mf = new Miniflare(makeOptions(tmp));
	useDispose(mf);

	const response = await mf.dispatchFetch(
		"http://example.com/nested/%5Bf%C3%BCnky%5D.txt"
	);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("nested asset");
});

test("serves files from assets directory relative to rootPath", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const assetsDir = path.join(tmp, "public");
	await fs.mkdir(assetsDir);
	await fs.writeFile(path.join(assetsDir, "test.txt"), "hello from asset");

	const mf = new Miniflare(makeOptions("public", { rootPath: tmp }));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello from asset");
});

test("serves an in-prefix asset under a non-root basePath", async ({
	expect,
}) => {
	const tmp = await useTmp();
	await fs.writeFile(path.join(tmp, "test.txt"), "hello from asset");

	const mf = new Miniflare(makeOptions(tmp, { basePath: "/subpath" }));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://example.com/subpath/test.txt");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello from asset");
});

test("returns 404 for an off-prefix request under a non-root basePath", async ({
	expect,
}) => {
	const tmp = await useTmp();
	await fs.writeFile(path.join(tmp, "test.txt"), "hello from asset");

	const mf = new Miniflare(makeOptions(tmp, { basePath: "/subpath" }));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://example.com/test.txt");
	expect(res.status).toBe(404);
	await res.arrayBuffer();
});

test("normalizes a relative basePath in the Asset Worker", async ({
	expect,
}) => {
	const tmp = await useTmp();
	await fs.writeFile(path.join(tmp, "test.txt"), "hello from asset");
	const mf = new Miniflare(makeOptions(tmp, { basePath: "relative/path" }));
	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://example.com/relative/path/test.txt"
	);
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello from asset");
});

test("serves each Worker's own assets when several Workers have assets", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const names = ["first", "second"];
	for (const name of names) {
		await fs.mkdir(path.join(tmp, name));
		await fs.writeFile(path.join(tmp, name, "name.txt"), name);
	}

	const mf = new Miniflare({
		workers: names.map((name) => ({
			config: {
				name,
				compatibilityDate: "2026-04-29",
				manifest: singleModuleManifest(
					"export default { fetch(request, env) { return env.ASSETS.fetch(request); } }"
				),
				assets: { directory: path.join(tmp, name) },
				env: { ASSETS: { type: "assets" } },
			},
		})),
	});
	useDispose(mf);

	for (const name of names) {
		const worker = await mf.getWorker(name);
		const res = await worker.fetch("http://example.com/name.txt");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(name);
	}
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
