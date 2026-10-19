import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import {
	build,
	copyFixture,
	startDevServer,
	startPreviewServer,
} from "./helpers";
import type { RsbuildConfig } from "@rsbuild/core";

// Mirrors the fixture's `rsbuild.config.ts`.
const config: RsbuildConfig = {
	source: { entry: { index: "./src/index.ts" } },
};

describe("spa-with-api", () => {
	test("serves client assets, the API, and the SPA fallback during dev", async ({
		expect,
	}) => {
		const url = await startDevServer(copyFixture("spa-with-api"), config);

		const index = await fetch(url);
		expect(index.headers.get("x-from-worker")).toBeNull();
		expect(await index.text()).toContain('src="/static/js/index.js"');

		const script = await fetch(new URL("/static/js/index.js", url));
		expect(script.headers.get("content-type")).toContain("javascript");
		expect(await script.text()).toContain("/api/hello");

		const api = await fetch(new URL("/api/hello", url));
		expect(await api.json()).toEqual({ name: "Cloudflare" });

		// Unmatched routes reach the Worker, which serves `index.html` through
		// its assets binding.
		const fallback = await fetch(new URL("/some/route", url));
		expect(fallback.headers.get("x-from-worker")).toBe("true");
		expect(await fallback.text()).toContain('src="/static/js/index.js"');
	});

	test("writes the client to the Worker's assets directory", async ({
		expect,
	}) => {
		const root = copyFixture("spa-with-api");
		await build(root, config);

		const workerDir = path.join(
			root,
			".cloudflare",
			"output",
			"v0",
			"workers",
			"default"
		);

		expect(fs.existsSync(path.join(workerDir, "assets", "index.html"))).toBe(
			true
		);
		expect(fs.existsSync(path.join(workerDir, "bundle", "index.js"))).toBe(
			true
		);
		expect(fs.existsSync(path.join(root, "dist"))).toBe(false);
		expect(
			JSON.parse(
				fs.readFileSync(path.join(workerDir, "worker.config.json"), "utf8")
			)
		).toMatchObject({
			assets: { notFoundHandling: "single-page-application" },
			env: { ASSETS: { type: "assets" } },
		});
	});

	test("previews the Build Output with assets served by workerd", async ({
		expect,
	}) => {
		const root = copyFixture("spa-with-api");
		await build(root, config);
		const url = await startPreviewServer(root);

		const index = await fetch(url);
		expect(index.headers.get("x-from-worker")).toBeNull();
		const html = await index.text();
		const scriptPath = html.match(/src="(\/static\/js\/index[^"]*\.js)"/)?.[1];
		expect(scriptPath).toBeDefined();

		const script = await fetch(new URL(scriptPath ?? "", url));
		expect(script.headers.get("x-from-worker")).toBeNull();
		expect(await script.text()).toContain("/api/hello");

		const api = await fetch(new URL("/api/hello", url));
		expect(await api.json()).toEqual({ name: "Cloudflare" });

		const fallback = await fetch(new URL("/some/route", url));
		expect(fallback.headers.get("x-from-worker")).toBe("true");
		expect(await fallback.text()).toBe(html);
	});
});
