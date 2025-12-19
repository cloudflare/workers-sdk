import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import esbuild from "esbuild";
import { Miniflare } from "miniflare";
import { beforeAll, expect, test } from "vitest";
import { useDispose, useTmp } from "../../test-shared";

const FIXTURES_PATH = path.resolve(__dirname, "../../fixtures/sites");
const SERVICE_WORKER_ENTRY_PATH = path.join(FIXTURES_PATH, "service-worker.ts");
const MODULES_ENTRY_PATH = path.join(FIXTURES_PATH, "modules.ts");

interface Context {
	serviceWorkerPath: string;
	modulesPath: string;
}

const ctx: Context = {
	serviceWorkerPath: "",
	modulesPath: "",
};

beforeAll(async () => {
	// Build fixtures
	const tmp = await useTmp();
	await esbuild.build({
		entryPoints: [SERVICE_WORKER_ENTRY_PATH, MODULES_ENTRY_PATH],
		format: "esm",
		external: ["__STATIC_CONTENT_MANIFEST"],
		bundle: true,
		sourcemap: true,
		outdir: tmp,
	});
	ctx.serviceWorkerPath = path.join(tmp, "service-worker.js");
	ctx.modulesPath = path.join(tmp, "modules.js");
});

type Route = keyof typeof routeContents;
const routeContents = {
	"/": "<p>Index</p>",
	"/a.txt": "a",
	"/b/b.txt": "b",
};

async function testGet(opts: {
	options: { siteInclude?: string[]; siteExclude?: string[] };
	expectedRoutes: Set<Route>;
}) {
	const tmp = await useTmp();
	for (const [route, contents] of Object.entries(routeContents)) {
		const routePath = path.join(tmp, route === "/" ? "index.html" : route);
		await fs.mkdir(path.dirname(routePath), { recursive: true });
		await fs.writeFile(routePath, contents, "utf8");
	}

	const mf = new Miniflare({
		...opts.options,
		scriptPath: ctx.serviceWorkerPath,
		sitePath: tmp,
	});
	useDispose(mf);

	for (const [route, expectedContents] of Object.entries(routeContents)) {
		const res = await mf.dispatchFetch(`http://localhost:8787${route}`);
		const expected = opts.expectedRoutes.has(route as Route);
		const text = (await res.text()).trim();
		expect(res.status).toBe(expected ? 200 : 404);
		if (expected) expect(text).toBe(expectedContents);
	}
}

test("gets all assets with no filter", async () => {
	await testGet({
		options: {},
		expectedRoutes: new Set<Route>(["/", "/a.txt", "/b/b.txt"]),
	});
});
test("gets included assets with include filter", async () => {
	await testGet({
		options: { siteInclude: ["b"] },
		expectedRoutes: new Set<Route>(["/b/b.txt"]),
	});
});
test("gets all but excluded assets with include filter", async () => {
	await testGet({
		options: { siteExclude: ["b"] },
		expectedRoutes: new Set<Route>(["/", "/a.txt"]),
	});
});
test("gets included assets with include and exclude filters", async () => {
	await testGet({
		options: { siteInclude: ["*.txt"], siteExclude: ["b"] },
		expectedRoutes: new Set<Route>(["/a.txt", "/b/b.txt"]),
	});
});

// Tests for checking different types of globs are matched correctly
async function testMatch(include: string) {
	const tmp = await useTmp();
	const dir = path.join(tmp, "a", "b", "c");
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, "test.txt"), "test", "utf8");
	const mf = new Miniflare({
		siteInclude: [include],
		scriptPath: ctx.serviceWorkerPath,
		sitePath: tmp,
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost:8787/a/b/c/test.txt");
	expect(res.status).toBe(200);
	await res.arrayBuffer();
}

test("matches file name pattern", async () => {
	await testMatch("test.txt");
});
test("matches exact pattern", async () => {
	await testMatch("a/b/c/test.txt");
});
test("matches extension patterns", async () => {
	await testMatch("*.txt");
});
test("matches globstar patterns", async () => {
	await testMatch("**/*.txt");
});
test("matches wildcard directory patterns", async () => {
	await testMatch("a/*/c/*.txt");
});

test("doesn't cache assets", async () => {
	const tmp = await useTmp();
	const testPath = path.join(tmp, "test.txt");
	await fs.writeFile(testPath, "1", "utf8");

	const mf = new Miniflare({
		scriptPath: ctx.serviceWorkerPath,
		sitePath: tmp,
	});
	useDispose(mf);

	const res1 = await mf.dispatchFetch("http://localhost:8787/test.txt");
	expect(res1.headers.get("CF-Cache-Status")).toBe("MISS");
	expect(await res1.text()).toBe("1");

	await fs.writeFile(testPath, "2", "utf8");
	const res2 = await mf.dispatchFetch("http://localhost:8787/test.txt");
	expect(res2.headers.get("CF-Cache-Status")).toBe("MISS");
	expect(await res2.text()).toBe("2");
});

test("gets assets with module worker", async () => {
	const tmp = await useTmp();
	const testPath = path.join(tmp, "test.txt");
	await fs.writeFile(testPath, "test", "utf8");
	const mf = new Miniflare({
		// TODO(soon): use `scriptPath` and `modules: true` once
		//  https://github.com/cloudflare/miniflare/pull/631 merged
		modulesRoot: path.dirname(ctx.modulesPath),
		modules: [{ type: "ESModule", path: ctx.modulesPath }],
		sitePath: tmp,
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost:8787/test.txt");
	expect(await res.text()).toBe("test");
});

test("gets assets with percent-encoded paths", async () => {
	// https://github.com/cloudflare/miniflare/issues/326
	const tmp = await useTmp();
	const testPath = path.join(tmp, "ń.txt");
	await fs.writeFile(testPath, "test", "utf8");
	const mf = new Miniflare({
		scriptPath: ctx.serviceWorkerPath,
		sitePath: tmp,
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost:8787/ń.txt");
	expect(await res.text()).toBe("test");
});

test.skipIf(process.platform === "win32")(
	"static content namespace supports listing keys",
	async () => {
		const tmp = await useTmp();
		await fs.mkdir(path.join(tmp, "a", "b", "c"), { recursive: true });
		await fs.writeFile(path.join(tmp, "1.txt"), "one");
		await fs.writeFile(path.join(tmp, "2.txt"), "two");
		await fs.writeFile(path.join(tmp, "a", "3.txt"), "three");
		await fs.writeFile(path.join(tmp, "a", "b", "4.txt"), "four");
		await fs.writeFile(path.join(tmp, "a", "b", "c", "5.txt"), "five");
		await fs.writeFile(path.join(tmp, "a", "b", "c", "6.txt"), "six");
		await fs.writeFile(path.join(tmp, "a", "b", "c", "7.txt"), "seven");
		const mf = new Miniflare({
			scriptPath: ctx.serviceWorkerPath,
			sitePath: tmp,
			siteExclude: ["**/5.txt"],
		});
		useDispose(mf);

		const kv = await mf.getKVNamespace("__STATIC_CONTENT");
		let result = await kv.list();
		expect(result).toEqual({
			keys: [
				{ name: "$__MINIFLARE_SITES__$/1.txt" },
				{ name: "$__MINIFLARE_SITES__$/2.txt" },
				{ name: "$__MINIFLARE_SITES__$/a%2F3.txt" },
				{ name: "$__MINIFLARE_SITES__$/a%2Fb%2F4.txt" },
				{ name: "$__MINIFLARE_SITES__$/a%2Fb%2Fc%2F6.txt" },
				{ name: "$__MINIFLARE_SITES__$/a%2Fb%2Fc%2F7.txt" },
			],
			list_complete: true,
			cacheStatus: null,
		});

		// Check with prefix, cursor and limit
		result = await kv.list({ prefix: "$__MINIFLARE_SITES__$/a%2F", limit: 1 });
		assert(!result.list_complete);
		expect(result).toEqual({
			keys: [{ name: "$__MINIFLARE_SITES__$/a%2F3.txt" }],
			list_complete: false,
			cursor: "JF9fTUlOSUZMQVJFX1NJVEVTX18kL2ElMkYzLnR4dA==",
			cacheStatus: null,
		});

		result = await kv.list({
			prefix: "$__MINIFLARE_SITES__$/a%2F",
			limit: 2,
			cursor: result.cursor,
		});
		assert(!result.list_complete);
		expect(result).toEqual({
			keys: [
				{ name: "$__MINIFLARE_SITES__$/a%2Fb%2F4.txt" },
				{ name: "$__MINIFLARE_SITES__$/a%2Fb%2Fc%2F6.txt" },
			],
			list_complete: false,
			cursor: "JF9fTUlOSUZMQVJFX1NJVEVTX18kL2ElMkZiJTJGYyUyRjYudHh0",
			cacheStatus: null,
		});

		result = await kv.list({
			prefix: "$__MINIFLARE_SITES__$/a%2F",
			cursor: result.cursor,
		});
		expect(result).toEqual({
			keys: [{ name: "$__MINIFLARE_SITES__$/a%2Fb%2Fc%2F7.txt" }],
			list_complete: true,
			cacheStatus: null,
		});
	}
);
