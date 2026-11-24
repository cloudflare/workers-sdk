import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, test, vi } from "vitest";

const execFileAsync = promisify(execFile);
const pluginUrl = new URL("../../dist/index.mjs", import.meta.url).href;
const viteUrl = import.meta.resolve("vite");

runInTempDir();
afterEach(() => vi.unstubAllEnvs());

test("respects WRANGLER_LOG_PATH set in the Vite config after importing the plugin", async ({
	expect,
}) => {
	await seed({
		"wrangler.json": JSON.stringify({
			name: "log-path",
			main: "./index.js",
			compatibility_date: "2026-04-01",
		}),
		"index.js": 'export default { fetch: () => new Response("ok") };',
		"vite.config.mjs": `
			import { cloudflare } from ${JSON.stringify(pluginUrl)};
			process.env.WRANGLER_LOG_PATH = "configured-logs/vite.log";
			export default {
				plugins: [cloudflare({ inspectorPort: false, persistState: false, remoteBindings: false })],
				server: { watch: null }
			};
		`,
	});
	// A fresh process preserves the original import-before-configuration order,
	// without a debug-log path cached by another plugin test.
	await execFileAsync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`
				import assert from "node:assert";
				import { createServer } from ${JSON.stringify(viteUrl)};
				const server = await createServer();
				try {
					await server.listen(0);
					const url = server.resolvedUrls?.local[0];
					assert(url);
					assert.equal(await (await fetch(url)).text(), "ok");
				} finally {
					await server.close();
				}
			`,
		],
		{
			env: {
				...process.env,
				WRANGLER_LOG_PATH: "",
				WRANGLER_WRITE_LOGS: "true",
				WRANGLER_SEND_METRICS: "false",
			},
			timeout: 30_000,
		}
	);
	expect(await fs.readFile("configured-logs/vite.log", "utf8")).toContain(
		"---"
	);
});
