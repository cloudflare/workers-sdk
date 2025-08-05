import { describe, expect, test } from "vitest";
import { createCloudflareEnvironmentOptions } from "../cloudflare-environment";
import type { WorkerConfig } from "../plugin-config";

describe("createCloudflareEnvironmentOptions", () => {
	test("sets preserveEntrySignatures to strict in rollupOptions", () => {
		const workerConfig = {
			name: "test-worker",
			main: "./src/index.ts",
			configPath: "./wrangler.toml",
		} as WorkerConfig;

		const userConfig = {};
		const environment = { name: "worker", isEntry: true };

		const options = createCloudflareEnvironmentOptions(
			workerConfig,
			userConfig,
			environment
		);

		expect(options.build?.rollupOptions?.preserveEntrySignatures).toBe(
			"strict"
		);
	});
});
