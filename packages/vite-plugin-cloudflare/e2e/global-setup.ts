import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import { removeDir } from "@cloudflare/workers-utils";
import type { TestProject } from "vitest/node";

const debuglog = util.debuglog("vite-plugin:test");

declare module "vitest" {
	export interface ProvidedContext {
		root: string;
	}
}

// Using a global setup means we can modify tests without having to re-install
// packages into our temporary directory
export default async function ({ provide }: TestProject) {
	const stopMockNpmRegistry = await startMockNpmRegistry(
		"@cloudflare/vite-plugin"
	);

	// Create temporary directory to host projects used for testing
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "vite-plugin-"));
	debuglog("Created temporary directory at " + root);

	// The type of the provided `root` is defined in the `ProvidedContent` type above.
	provide("root", root);

	// Cleanup temporary directory on teardown
	return async () => {
		await stopMockNpmRegistry();

		if (process.env.CLOUDFLARE_VITE_E2E_KEEP_TEMP_DIRS) {
			debuglog("Temporary directory left in-place at " + root);
		} else {
			debuglog("Cleaning up temporary directory...");
			await removeDir(root);
		}
	};
}
