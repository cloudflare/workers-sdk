import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkPublishedTypes } from "./published-types";

const wranglerBuild = "wrangler-dist";

function checkWranglerRuntime(tarball: string, cwd: string) {
	execFileSync("tar", ["-xzf", tarball, "-C", cwd]);
	const packageRoot = path.join(cwd, "package");
	function entryURL(file: string) {
		return JSON.stringify(
			pathToFileURL(path.join(packageRoot, wranglerBuild, file)).href
		);
	}

	writeFileSync(
		path.join(cwd, "wrangler.json"),
		JSON.stringify({
			name: "package-smoke-test",
			compatibility_date: "2025-04-28",
			k2: [{ binding: "PRODUCER", stream: "test-stream", remote: true }],
		})
	);
	const scriptPath = path.join(cwd, "check-wrangler.mjs");
	writeFileSync(
		scriptPath,
		`import assert from "node:assert/strict";
const { getPlatformProxy } = await import(${entryURL("cli.js")});
const { defineWranglerConfig } = await import(${entryURL("experimental-config.mjs")});
assert.equal(getPlatformProxy.name, "getPlatformProxy");
assert.equal(typeof defineWranglerConfig, "function");
const proxy = await getPlatformProxy({ configPath: "wrangler.json", persist: false });
await proxy.dispose();`
	);
	execFileSync(process.execPath, [scriptPath], {
		cwd,
		stdio: "inherit",
		timeout: 30_000,
		env: { ...process.env, NODE_ENV: "test" },
	});
}

if (require.main === module) {
	const [target, tarball] = process.argv.slice(2);
	assert(
		(target === "wrangler" && tarball) || target === "vite-plugin-cloudflare",
		"Usage: node -r esbuild-register tools/test/check-built-entry-points.ts wrangler <tarball> | vite-plugin-cloudflare"
	);
	const packageRoot = path.resolve(__dirname, "../../packages", target);
	const consumerRoot = mkdtempSync(
		path.join(tmpdir(), "workers-sdk-consumer-")
	);
	try {
		const diagnostics =
			target === "wrangler"
				? checkPublishedTypes(
						consumerRoot,
						packageRoot,
						wranglerBuild,
						`import { getPlatformProxy } from "wrangler";
import { defineWranglerConfig } from "wrangler/experimental-config";
defineWranglerConfig({});
void getPlatformProxy;`
					)
				: checkPublishedTypes(
						consumerRoot,
						packageRoot,
						"dist",
						`import { cloudflare } from "@cloudflare/vite-plugin";
cloudflare();`
					);
		assert.equal(
			diagnostics.length,
			0,
			`${target} declarations failed to type-check:\n${diagnostics.join("\n")}`
		);
		if (target === "wrangler") {
			checkWranglerRuntime(path.resolve(tarball), consumerRoot);
		}
		console.log(`${target} build output checks passed.`);
	} finally {
		// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- clean up the temporary consumer project without depending on a workspace build
		rmSync(consumerRoot, { recursive: true, force: true, maxRetries: 3 });
	}
}
