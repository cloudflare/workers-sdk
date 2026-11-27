import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkPublishedTypes } from "./published-types";

const wranglerBuild = "wrangler-dist";

function checkWranglerRuntime(packageRoot: string, cwd: string) {
	function entryURL(file: string) {
		return JSON.stringify(
			pathToFileURL(path.join(packageRoot, wranglerBuild, file)).href
		);
	}

	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`import assert from "node:assert/strict";
const { getPlatformProxy } = await import(${entryURL("cli.js")});
const { defineWranglerConfig } = await import(${entryURL("experimental-config.mjs")});
assert.equal(getPlatformProxy.name, "getPlatformProxy");
assert.equal(typeof defineWranglerConfig, "function");`,
		],
		{ cwd, stdio: "inherit", timeout: 30_000 }
	);
}

if (require.main === module) {
	const target = process.argv[2];
	assert(
		target === "wrangler" || target === "vite-plugin-cloudflare",
		"Usage: node -r esbuild-register tools/test/check-built-entry-points.ts <wrangler|vite-plugin-cloudflare>"
	);
	const packageRoot = path.resolve(__dirname, "../../packages", target);
	const consumerRoot = mkdtempSync(
		path.join(tmpdir(), "workers-sdk-consumer-")
	);
	try {
		if (target === "wrangler") {
			checkWranglerRuntime(packageRoot, consumerRoot);
		}

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
		console.log(`${target} build output checks passed.`);
	} finally {
		// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- clean up the temporary consumer project without depending on a workspace build
		rmSync(consumerRoot, { recursive: true, force: true, maxRetries: 3 });
	}
}
