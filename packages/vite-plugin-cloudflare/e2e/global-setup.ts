import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import type { GlobalSetupContext } from "vitest/node";

declare module "vitest" {
	export interface ProvidedContext {
		root: string;
	}
}

// Using a global setup means we can modify tests without having to re-install
// packages into our temporary directory
// Typings for the GlobalSetupContext are augmented in `global-setup.d.ts`.
export default async function ({ provide }: GlobalSetupContext) {
	const stopMockNpmRegistry = await startMockNpmRegistry(
		"@cloudflare/vite-plugin"
	);

	// Create temporary directory to host projects used for testing
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "vite-plugin-"));

	provide("root", root);

	// Cleanup temporary directory on teardown
	return async () => {
		await stopMockNpmRegistry();

		console.log("Cleaning up temporary directory...");
		await fs.rm(root, { recursive: true, maxRetries: 10 });
	};
}
