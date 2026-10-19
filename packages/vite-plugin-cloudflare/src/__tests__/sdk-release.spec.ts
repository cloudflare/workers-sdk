import { realpath, writeFile } from "node:fs/promises";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder, createServer, preview } from "vite";
import { test, vi } from "vitest";
import { cloudflare } from "../../dist/index.mjs";

runInTempDir();

test.for(["dev", "preview"] as const)(
	"runs the published v1 plugin with the October 19 SDK in %s",
	async (mode, { expect, onTestFinished }) => {
		const root = await realpath(process.cwd());
		process.chdir(root);
		vi.stubEnv("PWD", root);
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});
		await writeFile("package.json", JSON.stringify({ type: "module" }));
		await writeFile(
			"wrangler.json",
			JSON.stringify({
				name: "v1-sdk-release",
				main: "index.js",
				compatibility_date: "2026-10-19",
				vars: { RELEASE: "october-19" },
			})
		);
		await writeFile(
			"index.js",
			`
export default {
 fetch(request, env) {
  return Response.json({ release: env.RELEASE, path: new URL(request.url).pathname });
 },
};
`
		);
		const config = {
			root,
			configFile: false as const,
			logLevel: "silent" as const,
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					remoteBindings: false,
				}),
			],
			server: { port: 0 },
			preview: { port: 0 },
		};
		if (mode === "preview") {
			const builder = await createBuilder(config);
			await builder.buildApp();
		}
		const server =
			mode === "dev" ? await createServer(config) : await preview(config);
		onTestFinished(() => server.close());
		if ("listen" in server) {
			await server.listen();
		}
		const url = server.resolvedUrls?.local[0];
		if (!url) {
			throw new Error("The v1 plugin did not start a local server");
		}
		const response = await fetch(new URL("/release-check", url));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			release: "october-19",
			path: "/release-check",
		});
	}
);
