import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { test, vi } from "vitest";

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "artifacts-local");

test.for([
	{ remote: false, remoteBindings: true },
	{ remote: undefined, remoteBindings: false },
	{ remote: true, remoteBindings: false },
])(
	"serves local Artifacts from Wrangler config: %j",
	async (options, { expect, onTestFinished }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		onTestFinished(() => removeDirSync(root));
		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ type: "module" })
		);
		fs.writeFileSync(
			path.join(root, "wrangler.json"),
			JSON.stringify({
				name: "vite-artifacts-local",
				main: "index.js",
				compatibility_date: "2026-09-03",
				artifacts: [
					{ binding: "REPOS", namespace: "examples", remote: options.remote },
				],
			})
		);
		fs.writeFileSync(
			path.join(root, "index.js"),
			`export default {
		async fetch(request, env) {
			if (new URL(request.url).pathname === "/create") return Response.json(await env.REPOS.create("demo"));
			return Response.json(await env.REPOS.list());
		}
	};`
		);
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			server: { port: 0 },
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					remoteBindings: options.remoteBindings,
				}),
			],
		});
		try {
			await server.listen();
			const url = server.resolvedUrls?.local[0];
			assert(url, "Expected the Vite server URL");
			const created = (await (await fetch(new URL("create", url))).json()) as {
				remote: string;
			};
			expect(new URL(created.remote).hostname).toBe("127.0.0.1");
			const listed = (await (await fetch(url)).json()) as { repos: unknown[] };
			expect(listed.repos).toHaveLength(1);
		} finally {
			await server.close();
		}
	}
);
