import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPublishedTypes } from "./published-types";

if (require.main === module) {
	const target = process.argv[2];
	assert(
		target === "vite-plugin-cloudflare",
		"Usage: node -r esbuild-register tools/test/check-built-entry-points.ts vite-plugin-cloudflare"
	);
	const packageRoot = path.resolve(__dirname, "../../packages", target);
	const consumerRoot = mkdtempSync(
		path.join(tmpdir(), "workers-sdk-consumer-")
	);
	try {
		const diagnostics = checkPublishedTypes(
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
