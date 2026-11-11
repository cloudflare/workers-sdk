import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "vitest";

// https://github.com/cloudflare/workers-sdk/issues/16644
// Bun resolves the bare "undici" specifier to its own built-in module, whose
// `fetch()` ignores the `dispatcher` option that `dispatchFetch()` relies on.
test("dispatchFetch() works when Miniflare runs on the Bun runtime", ({
	expect,
}) => {
	const script = `
		const { Miniflare } = require(${JSON.stringify(
			path.resolve(import.meta.dirname, "../dist/src/index.js")
		)});
		(async () => {
			const mf = new Miniflare({
				workers: [{ config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: process.cwd(),
						modules: { "index.mjs": { type: "esm", contents: "export default { fetch() { return new Response('hello from workerd'); } }" } },
					},
				} }],
			});
			try {
				const res = await mf.dispatchFetch("http://localhost/");
				console.log("RESULT:" + res.status + ":" + (await res.text()));
			} finally {
				await mf.dispose();
			}
		})().catch((e) => { console.log("ERROR:" + e.message); process.exit(1); });
	`;
	let output: string;
	try {
		output = execFileSync("npx", ["--yes", "bun@1.4.4", "-e", script], {
			encoding: "utf8",
			timeout: 110_000,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (e) {
		const err = e as { stdout?: string; stderr?: string; message: string };
		output = `${err.stdout ?? ""}${err.stderr ?? ""}${err.message}`;
	}
	expect(output).toContain("RESULT:200:hello from workerd");
}, 120_000);
