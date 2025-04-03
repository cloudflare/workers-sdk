import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import type { TestProject } from "vitest/node";

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

	provide("root", root);

	// Cleanup temporary directory on teardown
	return async () => {
		await stopMockNpmRegistry();

		if (!process.env.CLOUDFLARE_VITE_E2E_KEEP_TEMP_DIRS) {
			console.log("Cleaning up temporary directory...", root);
			await fs.rm(root, { recursive: true, maxRetries: 10 });
		}
	};
}
