import fs from "fs/promises";
import path from "path";
import anyTest, { Macro, TestFn } from "ava";
import esbuild from "esbuild";
import { Miniflare } from "miniflare";
import { useTmp } from "../../test-shared";

const FIXTURES_PATH = path.resolve(
	__dirname,
	"../../../../test/fixtures/assets"
);
const MODULES_ENTRY_PATH = path.join(
	FIXTURES_PATH,
	"worker-with-default-assets-bindings.ts"
);

interface Context {
	modulesPath: string;
}

const test = anyTest as TestFn<Context>;

test.before(async (t) => {
	// Build fixtures
	const tmp = await useTmp(t);
	await esbuild.build({
		entryPoints: [MODULES_ENTRY_PATH],
		format: "esm",
		bundle: true,
		sourcemap: true,
		outdir: tmp,
	});
	t.context.modulesPath = path.join(
		tmp,
		"worker-with-default-assets-bindings.js"
	);
});

type Route = keyof typeof routeContents;
const routeContents = {
	"/index.html": "<p>Index</p>",
	"/a.txt": "a",
	"/b/b.txt": "b",
};

const getAssetMacro: Macro<[Set<Route>], Context> = {
	async exec(t, expectedRoutes) {
		const tmp = await useTmp(t);
		for (const [route, contents] of Object.entries(routeContents)) {
			const routePath = path.join(tmp, route);
			await fs.mkdir(path.dirname(routePath), { recursive: true });
			await fs.writeFile(routePath, contents, "utf8");
		}

		const mf = new Miniflare({
			scriptPath: t.context.modulesPath,
			modules: true,
			assetsPath: tmp,
		});
		t.teardown(() => mf.dispose());

		for (const [route, expectedContents] of Object.entries(routeContents)) {
			const res = await mf.dispatchFetch(`http://localhost:8787${route}`);
			const text = (await res.text()).trim();
			const expected = expectedRoutes.has(route as Route);
			t.is(res.status, expected ? 200 : 404, `${route}: ${text}`);
			if (expected) t.is(text, expectedContents, route);
		}
	},
};

// Tests for checking different types of globs are matched correctly
const matchMacro: Macro<[string], Context> = {
	async exec(t) {
		const tmp = await useTmp(t);
		const dir = path.join(tmp, "a", "b", "c");
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, "test.txt"), "test", "utf8");
		const mf = new Miniflare({
			scriptPath: t.context.modulesPath,
			modules: true,
			assetsPath: tmp,
		});
		t.teardown(() => mf.dispose());

		const res = await mf.dispatchFetch("http://localhost:8787/a/b/c/test.txt");
		t.is(res.status, 200);
		await res.arrayBuffer();
	},
};

const customBindingsMacro: Macro<[Set<Route>], Context> = {
	async exec(t, expectedRoutes) {
		const ENTRY_PATH = path.join(
			FIXTURES_PATH,
			"worker-with-custom-assets-bindings.ts"
		);
		const tmp = await useTmp(t);

		for (const [route, contents] of Object.entries(routeContents)) {
			const routePath = path.join(tmp, route);
			await fs.mkdir(path.dirname(routePath), { recursive: true });
			await fs.writeFile(routePath, contents, "utf8");
		}

		await esbuild.build({
			entryPoints: [ENTRY_PATH],
			format: "esm",
			bundle: true,
			sourcemap: true,
			outdir: tmp,
		});
		t.context.modulesPath = path.join(
			tmp,
			"worker-with-custom-assets-bindings.js"
		);

		const mf = new Miniflare({
			scriptPath: t.context.modulesPath,
			modules: true,
			assetsPath: tmp,
			assetsKVBindingName: "CUSTOM_ASSETS_NAMESPACE",
		});
		t.teardown(() => mf.dispose());

		for (const [route, expectedContents] of Object.entries(routeContents)) {
			const res = await mf.dispatchFetch(`http://localhost:8787${route}`);
			const text = (await res.text()).trim();
			const expected = expectedRoutes.has(route as Route);
			t.is(res.status, expected ? 200 : 404, `${route}: ${text}`);
			if (expected) t.is(text, expectedContents, route);
		}
	},
};

test(
	"gets all assets",
	getAssetMacro,
	new Set<Route>(["/index.html", "/a.txt", "/b/b.txt"])
);

test("matches file name pattern", matchMacro, "test.txt");
test("matches exact pattern", matchMacro, "a/b/c/test.txt");
test("matches extension patterns", matchMacro, "*.txt");
test("matches globstar patterns", matchMacro, "**/*.txt");
test("matches wildcard directory patterns", matchMacro, "a/*/c/*.txt");

test("gets assets with percent-encoded paths", async (t) => {
	// https://github.com/cloudflare/miniflare/issues/326
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "ń.txt");
	await fs.writeFile(testPath, "test", "utf8");
	const mf = new Miniflare({
		scriptPath: t.context.modulesPath,
		modules: true,
		assetsPath: tmp,
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost:8787/ń.txt");
	t.is(await res.text(), "test");
});

// skipping until we put caching in place
test.skip("doesn't cache assets", async (t) => {
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "test.txt");
	await fs.writeFile(testPath, "1", "utf8");

	const mf = new Miniflare({
		scriptPath: t.context.modulesPath,
		modules: true,
		assetsPath: tmp,
	});
	t.teardown(() => mf.dispose());

	const res1 = await mf.dispatchFetch("http://localhost:8787/test.txt");
	const text1 = await res1.text();
	t.is(res1.headers.get("CF-Cache-Status"), "MISS");
	t.is(text1, "1");

	await fs.writeFile(testPath, "2", "utf8");
	const res2 = await mf.dispatchFetch("http://localhost:8787/test.txt");
	const text2 = await res2.text();
	t.is(res2.headers.get("CF-Cache-Status"), "MISS");
	t.is(text2, "2");
});

test(
	"supports binding to a custom assets KV namespace",
	customBindingsMacro,
	new Set<Route>(["/index.html", "/a.txt", "/b/b.txt"])
);
