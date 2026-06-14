import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { dedent } from "../src/utils/dedent";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

const TIMEOUT = 90_000;

function read(helper: WranglerE2ETestHelper, file: string): string {
	return readFileSync(path.join(helper.tmpPath, file), "utf8");
}

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("could not determine port"));
				return;
			}
			const { port } = address;
			server.close(() => resolve(port));
		});
	});
}

describe("compile", { timeout: TIMEOUT }, () => {
	it("compiles a Worker with static assets into a standalone bundle", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "compile-test",
				main: "src/index.ts",
				compatibility_date: "2024-01-01",
				standalone: true,
				vars: { GREETING: "hello" },
				assets: { directory: "./public", binding: "ASSETS" },
			}),
			"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						return new Response(env.GREETING);
					},
				};
			`,
			"public/index.html": "<!doctype html><h1>standalone</h1>",
			"package.json": dedent`
				{
					"name": "compile-test",
					"version": "0.0.0",
					"private": true
				}
			`,
		});

		const output = await helper.run(`wrangler compile`);
		expect(output.stdout).toContain("standalone");

		// Core runtime artifacts are emitted to the default output directory.
		const capnp = read(helper, "dist-standalone/config.capnp");
		expect(capnp).toContain("Workerd.Config");
		// The user's plain-text var is baked into the generated config.
		expect(capnp).toContain("GREETING");
		expect(capnp).toContain("hello");

		const dockerfile = read(helper, "dist-standalone/Dockerfile");
		// The runtime is pinned to the exact workerd version we generated against.
		expect(dockerfile).toMatch(/npm install workerd@\d[\w.-]+ --no-save/);
		expect(dockerfile).toContain('ENTRYPOINT ["sh", "/app/entrypoint.sh"]');

		const entrypoint = read(helper, "dist-standalone/entrypoint.sh");
		expect(entrypoint).toContain("workerd serve config.capnp");

		const report = read(helper, "dist-standalone/COMPILE_REPORT.md");
		expect(report).toContain("wrangler compile` report");

		// The human-facing README has copy-pasteable run instructions and lists
		// the text-format `src/` embeds.
		const readme = read(helper, "dist-standalone/README.md");
		expect(readme).toContain("standalone `workerd` bundle");
		expect(readme).toContain("workerd serve config.capnp");
		expect(readme).toContain("`src/`");

		// The static asset is copied into the bundle (as a workerd `disk`
		// service) so workerd can serve it.
		expect(
			read(helper, "dist-standalone/disk/assets_storage/index.html")
		).toContain("standalone");
	});

	it("errors when the Worker uses bindings unsupported by standalone workerd", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "compile-unsupported",
				main: "src/index.ts",
				compatibility_date: "2024-01-01",
				standalone: true,
				kv_namespaces: [{ binding: "MY_KV", id: "abc123" }],
			}),
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("ok");
					},
				};
			`,
			"package.json": dedent`
				{
					"name": "compile-unsupported",
					"version": "0.0.0",
					"private": true
				}
			`,
		});

		const result = await helper.run(`wrangler compile`);
		expect(result.status).not.toBe(0);
		const combined = `${result.stdout}\n${result.stderr}`;
		expect(combined).toContain("not yet supported by standalone workerd");
		expect(combined).toContain("MY_KV (kv_namespace)");
	});

	it("compiles an unsupported-binding Worker when --force is passed", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "compile-forced",
				main: "src/index.ts",
				compatibility_date: "2024-01-01",
				standalone: true,
				kv_namespaces: [{ binding: "MY_KV", id: "abc123" }],
			}),
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("ok");
					},
				};
			`,
			"package.json": dedent`
				{
					"name": "compile-forced",
					"version": "0.0.0",
					"private": true
				}
			`,
		});

		await helper.run(`wrangler compile --force`);
		const capnp = read(helper, "dist-standalone/config.capnp");
		expect(capnp).toContain("Workerd.Config");
	});

	it("runs the compiled bundle with --serve (the exact production artifact)", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "compile-serve",
				main: "src/index.ts",
				compatibility_date: "2024-01-01",
				standalone: true,
				vars: { GREETING: "hello from serve" },
				assets: { directory: "./public", binding: "ASSETS" },
			}),
			"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						const url = new URL(request.url);
						if (url.pathname.startsWith("/api")) {
							return new Response(env.GREETING);
						}
						return env.ASSETS.fetch(request);
					},
				};
			`,
			"public/index.html": "<!doctype html><h1>served standalone</h1>",
			"package.json": dedent`
				{
					"name": "compile-serve",
					"version": "0.0.0",
					"private": true
				}
			`,
		});

		const port = await getFreePort();
		const server = helper.runLongLived(
			`wrangler compile --serve --ip 127.0.0.1 --port ${port}`
		);
		await server.readUntil(/Serving ".*" on http:\/\//, 60_000);

		const base = `http://127.0.0.1:${port}`;

		// Dynamic route hits the user Worker (with the env var baked in).
		const api = await fetch(`${base}/api/hello`);
		expect(api.status).toBe(200);
		expect(await api.text()).toBe("hello from serve");

		// Static asset served from the bundled `disk` service.
		const root = await fetch(`${base}/`);
		expect(root.status).toBe(200);
		expect(await root.text()).toContain("served standalone");

		// Unknown asset path hits the real `not_found_handling` (404).
		const missing = await fetch(`${base}/does-not-exist.html`);
		expect(missing.status).toBe(404);
	});

	it("runs a --format binary bundle with --serve", async ({ expect }) => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "compile-binary",
				main: "src/index.ts",
				compatibility_date: "2024-01-01",
				standalone: true,
				vars: { GREETING: "hello from binary" },
				assets: { directory: "./public", binding: "ASSETS" },
			}),
			"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						const url = new URL(request.url);
						if (url.pathname.startsWith("/api")) {
							return new Response(env.GREETING);
						}
						return env.ASSETS.fetch(request);
					},
				};
			`,
			"public/index.html": "<!doctype html><h1>served binary</h1>",
			"package.json": dedent`
				{
					"name": "compile-binary",
					"version": "0.0.0",
					"private": true
				}
			`,
		});

		const port = await getFreePort();
		const server = helper.runLongLived(
			`wrangler compile --format binary --serve --ip 127.0.0.1 --port ${port}`
		);
		await server.readUntil(/Serving ".*" on http:\/\//, 60_000);

		const base = `http://127.0.0.1:${port}`;

		// The dynamic route and static asset both work from the single binary config.
		const api = await fetch(`${base}/api/hello`);
		expect(api.status).toBe(200);
		expect(await api.text()).toBe("hello from binary");

		const root = await fetch(`${base}/`);
		expect(root.status).toBe(200);
		expect(await root.text()).toContain("served binary");

		// Binary bundles emit a single self-contained config.bin (no text capnp).
		const configBin = read(helper, "dist-standalone/config.bin");
		expect(configBin.length).toBeGreaterThan(0);
		const entrypoint = read(helper, "dist-standalone/entrypoint.sh");
		expect(entrypoint).toContain("workerd serve --binary config.bin");
	});
});
