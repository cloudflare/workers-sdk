import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, assert, beforeAll, describe, test, vi } from "vitest";
import { unstable_startWorker } from "wrangler";
import { wranglerEntryPath } from "../../shared/src/run-wrangler-long-lived";

async function getTmpDir() {
	return fs.mkdtemp(path.join(os.tmpdir(), "wrangler-modules-"));
}

type WranglerDev = Awaited<ReturnType<typeof unstable_startWorker>>;
function get(worker: WranglerDev, pathname: string) {
	const url = `http://example.com${pathname}`;
	// Disable Miniflare's pretty error page, so we can parse errors as JSON
	return worker.fetch(url, { headers: { "MF-Disable-Pretty-Error": "true" } });
}

describe("find_additional_modules dev", () => {
	let tmpDir: string;
	let worker: WranglerDev;

	beforeAll(async () => {
		// Copy over files to a temporary directory as we'll be modifying them
		tmpDir = await getTmpDir();
		await fs.cp(
			path.resolve(__dirname, "..", "src"),
			path.join(tmpDir, "src"),
			{ recursive: true }
		);
		await fs.cp(
			path.resolve(__dirname, "..", "wrangler.jsonc"),
			path.join(tmpDir, "wrangler.jsonc")
		);

		worker = await unstable_startWorker({
			config: path.join(tmpDir, "wrangler.jsonc"),
		});
	});
	afterAll(async () => {
		await worker.dispose();
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch (e) {
			// It seems that Windows doesn't let us delete this, with errors like:
			//
			// Error: EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\wrangler-modules-pKJ7OQ'
			// ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			// Serialized Error: {
			// 	"code": "EBUSY",
			// 	"errno": -4082,
			// 	"path": "C:\Users\RUNNER~1\AppData\Local\Temp\wrangler-modules-pKJ7OQ",
			// 	"syscall": "rmdir",
			// }
			console.error(e);
		}
	});

	test("supports bundled modules", async ({ expect }) => {
		const res = await get(worker, "/dep");
		expect(await res.text()).toBe("bundled");
	});
	test("supports text modules", async ({ expect }) => {
		const res = await get(worker, "/text");
		expect(await res.text()).toBe("test\n");
	});
	test("supports SQL modules", async ({ expect }) => {
		const res = await get(worker, "/sql");
		expect(await res.text()).toBe("SELECT * FROM users;\n");
	});
	test("supports dynamic imports", async ({ expect }) => {
		const res = await get(worker, "/dynamic");
		expect(await res.text()).toBe("dynamic");
	});
	test("supports commonjs lazy imports", async ({ expect }) => {
		const res = await get(worker, "/common");
		expect(await res.text()).toBe("common");
	});
	test("supports variable dynamic imports", async ({ expect }) => {
		const res = await get(worker, "/lang/en");
		expect(await res.text()).toBe("hello");
	});

	test("watches additional modules", async ({ expect }) => {
		const srcDir = path.join(tmpDir, "src");

		// Update dynamically imported file
		await fs.writeFile(
			path.join(srcDir, "dynamic.js"),
			'export default "new dynamic";'
		);
		await vi.waitFor(async () => {
			const res = await get(worker, "/dynamic");
			assert.strictEqual(await res.text(), "new dynamic");
		});

		// Delete dynamically imported file
		await fs.rm(path.join(srcDir, "lang", "en.js"));

		await vi.waitFor(async () => {
			await expect(get(worker, "/lang/en")).rejects.toThrowError(
				'No such module "lang/en.js".'
			);
		});

		// Create new dynamically imported file in new directory
		await fs.mkdir(path.join(srcDir, "lang", "en"));
		await fs.writeFile(
			path.join(srcDir, "lang", "en", "us.js"),
			'export default { hello: "hey" };'
		);
		await vi.waitFor(async () => {
			const res = await get(worker, "/lang/en/us");
			assert.strictEqual(await res.text(), "hey");
		});

		// Update newly created file
		await fs.writeFile(
			path.join(srcDir, "lang", "en", "us.js"),
			'export default { hello: "bye" };'
		);
		await vi.waitFor(async () => {
			const res = await get(worker, "/lang/en/us");
			assert.strictEqual(await res.text(), "bye");
		});
	});
});

function build(cwd: string, outDir: string) {
	return childProcess.spawnSync(
		process.execPath,
		[wranglerEntryPath, "deploy", "--dry-run", `--outdir=${outDir}`],
		{ cwd }
	);
}

describe("find_additional_modules deploy", () => {
	let tmpDir: string;
	beforeAll(async () => {
		tmpDir = await getTmpDir();
	});
	afterAll(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	test("doesn't bundle additional modules", async ({ expect }) => {
		const outDir = path.join(tmpDir, "out");
		const result = await build(path.resolve(__dirname, ".."), outDir);
		expect(result.status).toBe(0);

		// Check additional modules marked external, but other dependencies bundled
		const bundledEntryPath = path.join(outDir, "index.js");
		const bundledEntry = await fs.readFile(bundledEntryPath, "utf8");
		expect(bundledEntry).toMatchInlineSnapshot(`
			"// src/index.ts
			import common from "./common.cjs";

			// src/dep.ts
			var dep_default = "bundled";

			// src/index.ts
			import sql from "./example.sql";
			import text from "./text.txt";
			var index_default = {
			  async fetch(request) {
			    const url = new URL(request.url);
			    if (url.pathname === "/dep") {
			      return new Response(dep_default);
			    }
			    if (url.pathname === "/text") {
			      return new Response(text);
			    }
			    if (url.pathname === "/sql") {
			      return new Response(sql);
			    }
			    if (url.pathname === "/common") {
			      return new Response(common);
			    }
			    if (url.pathname === "/dynamic") {
			      return new Response((await import("./dynamic.js")).default);
			    }
			    if (url.pathname.startsWith("/lang/")) {
			      const language = "./lang/" + url.pathname.substring("/lang/".length) + ".js";
			      return new Response((await import(language)).default.hello);
			    }
			    return new Response("Not Found", { status: 404 });
			  }
			};
			export {
			  index_default as default
			};
			//# sourceMappingURL=index.js.map
			"
		`);

		// Check additional modules included in output
		expect(existsSync(path.join(outDir, "text.txt"))).toBe(true);
		expect(existsSync(path.join(outDir, "dynamic.js"))).toBe(true);
		expect(existsSync(path.join(outDir, "lang", "en.js"))).toBe(true);
		expect(existsSync(path.join(outDir, "lang", "fr.js"))).toBe(true);
	});

	test("fails with service worker entrypoint", async ({ expect }) => {
		// Write basic service worker with `find_additional_modules` enabled
		const serviceWorkerDir = path.join(tmpDir, "service-worker");
		await fs.mkdir(serviceWorkerDir, { recursive: true });
		await fs.writeFile(
			path.join(serviceWorkerDir, "index.js"),
			"addEventListener('fetch', (e) => e.respondWith(new Response()))"
		);
		await fs.writeFile(
			path.join(serviceWorkerDir, "wrangler.toml"),
			[
				'name="service-worker-test"',
				'main = "index.js"',
				'compatibility_date = "2023-08-01"',
				"find_additional_modules = true",
			].join("\n")
		);

		// Try build, and check fails
		const serviceWorkerOutDir = path.join(tmpDir, "service-worker-out");
		const result = await build(serviceWorkerDir, serviceWorkerOutDir);
		expect(result.status).toBe(1);
		expect(result.stderr.toString()).toContain(
			"`find_additional_modules` can only be used with an ES module entrypoint."
		);
	});
});
