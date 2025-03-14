import assert from "node:assert";
import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	runWranglerDev,
	wranglerEntryPath,
} from "../../shared/src/run-wrangler-long-lived";

async function getTmpDir() {
	return fs.mkdtemp(path.join(os.tmpdir(), "wrangler-modules-"));
}

type WranglerDev = Awaited<ReturnType<typeof runWranglerDev>>;
function get(worker: WranglerDev, pathname: string) {
	const url = `http://${worker.ip}:${worker.port}${pathname}`;
	// Disable Miniflare's pretty error page, so we can parse errors as JSON
	return fetch(url, { headers: { "MF-Disable-Pretty-Error": "true" } });
}

async function retry<T>(closure: () => Promise<T>, max = 30): Promise<T> {
	for (let attempt = 1; attempt <= max; attempt++) {
		try {
			return await closure();
		} catch (e) {
			if (attempt === max) throw e;
		}
		await setTimeout(1_000);
	}
	assert.fail("Unreachable");
}

describe("wildcard imports: dev", () => {
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
			path.resolve(__dirname, "..", "wrangler.toml"),
			path.join(tmpDir, "wrangler.toml")
		);

		worker = await runWranglerDev(tmpDir, ["--port=0", "--inspector-port=0"]);
	});
	afterAll(async () => {
		await worker.stop();
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

	test("supports bundled modules", async () => {
		const res = await get(worker, "/dep");
		expect(await res.text()).toBe("bundled");
	});
	test("supports text modules", async () => {
		const res = await get(worker, "/text");
		expect(await res.text()).toBe("test\n");
	});
	test("supports dynamic imports", async () => {
		const res = await get(worker, "/dynamic");
		expect(await res.text()).toBe("dynamic");
	});
	test("supports commonjs lazy imports", async () => {
		const res = await get(worker, "/common");
		expect(await res.text()).toBe("common");
	});
	test("supports variable dynamic imports", async () => {
		const res = await get(worker, "/lang/en");
		expect(await res.text()).toBe("hello");
	});

	test("watches wildcard modules", async () => {
		const srcDir = path.join(tmpDir, "src");

		// Update dynamically imported file
		await fs.writeFile(
			path.join(srcDir, "dynamic.js"),
			'export default "new dynamic";'
		);
		await retry(async () => {
			const res = await get(worker, "/dynamic");
			assert.strictEqual(await res.text(), "new dynamic");
		});

		// Delete dynamically imported file
		await fs.rm(path.join(srcDir, "lang", "en.js"));
		const res = await retry(async () => {
			const res = await get(worker, "/lang/en");
			assert.strictEqual(res.status, 500);
			return res;
		});
		const error = (await res.json()) as { message?: string };
		expect(error.message).toBe("Module not found in bundle: ./lang/en.js");

		// Create new dynamically imported file in new directory
		await fs.mkdir(path.join(srcDir, "lang", "en"));
		await fs.writeFile(
			path.join(srcDir, "lang", "en", "us.js"),
			'export default { hello: "hey" };'
		);
		await retry(async () => {
			const res = await get(worker, "/lang/en/us");
			assert.strictEqual(await res.text(), "hey");
		});

		// Update newly created file
		await fs.writeFile(
			path.join(srcDir, "lang", "en", "us.js"),
			'export default { hello: "bye" };'
		);
		await retry(async () => {
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

describe("wildcard imports: deploy", () => {
	let tmpDir: string;
	beforeAll(async () => {
		tmpDir = await getTmpDir();
	});
	afterAll(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	test("bundles wildcard modules", async () => {
		const outDir = path.join(tmpDir, "out");
		const result = build(path.resolve(__dirname, ".."), outDir);
		expect(result.status).toBe(0);

		// Check additional modules marked external, but other dependencies bundled
		const bundledEntryPath = path.join(outDir, "index.js");
		const bundledEntry = await fs.readFile(bundledEntryPath, "utf8");
		const imports = [
			`import text from "./4e1243bd22c66e76c2ba9eddc1f91394e57f9f83-text.txt";`,
			`// src/common.cjs`,
			`// src/lang/en.js`,
			`// src/lang/fr.js`,
			`// src/dynamic.js`,
			`// import("./lang/**/*.js") in src/index.ts`,
		];
		for (const importStatement of imports) {
			expect(bundledEntry).toContain(importStatement);
		}

		// Check additional modules included in output
		expect(
			existsSync(
				path.join(outDir, "4e1243bd22c66e76c2ba9eddc1f91394e57f9f83-text.txt")
			)
		).toBe(true);
	});

	test("fails with service worker entrypoint", async () => {
		const serviceWorkerDir = path.join(tmpDir, "service-worker");
		await fs.mkdir(serviceWorkerDir, { recursive: true });
		await fs.writeFile(
			path.join(serviceWorkerDir, "index.js"),
			`
			async function handleRequest(e) {
				const url = new URL(e.request.url);
				if (url.pathname === "/") {
					return new Response("Hello World");
				} else if(url.pathname.startsWith("/lang/")) {
					const language = url.pathname.substring("/lang/".length);
					return new Response((await import(\`./lang/\${language}.js\`)).default.hello);
				}
				return new Response("Not Found", { status: 404 });
			}

			addEventListener('fetch', (e) => e.respondWith(handleRequest(e)))`
		);
		await fs.writeFile(
			path.join(serviceWorkerDir, "wrangler.toml"),
			[
				'name="service-worker-test"',
				'main = "index.js"',
				'compatibility_date = "2024-09-09"',
			].join("\n")
		);

		// Try build, and check fails
		const serviceWorkerOutDir = path.join(tmpDir, "service-worker-out");
		const result = build(serviceWorkerDir, serviceWorkerOutDir);
		expect(result.status).toBe(1);
	});
});
