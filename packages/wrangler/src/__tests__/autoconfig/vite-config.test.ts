import { writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	transformViteConfig,
} from "../../autoconfig/frameworks/utils/vite-config";
import { logger } from "../../logger";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";

describe("vite-config utils", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		logger.loggerLevel = "debug";
	});

	describe("checkIfViteConfigUsesCloudflarePlugin", () => {
		it("should handle vite config with function-based defineConfig", async () => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: []
}));
`
			);

			const result = checkIfViteConfigUsesCloudflarePlugin(".");
			expect(result).toBe(false);
			expect(std.debug).toContain("Vite config uses a non-object expression");
		});

		it("should handle vite config without plugins array", async () => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3000 }
});
`
			);

			const result = checkIfViteConfigUsesCloudflarePlugin(".");
			expect(result).toBe(false);
			expect(std.debug).toContain(
				"Vite config does not have a valid plugins array"
			);
		});

		it("should detect cloudflare plugin correctly", async () => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()]
});
`
			);

			const result = checkIfViteConfigUsesCloudflarePlugin(".");
			expect(result).toBe(true);
		});
	});

	describe("transformViteConfig", () => {
		it("should throw UserError for function-based defineConfig", async () => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: []
}));
`
			);

			expect(() => transformViteConfig(".")).toThrowError(
				/Cannot modify Vite config: expected an object literal/
			);
		});

		it("should throw UserError when plugins array is missing", async () => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3000 }
});
`
			);

			expect(() => transformViteConfig(".")).toThrowError(
				/Cannot modify Vite config: could not find a valid plugins array/
			);
		});

		it("should successfully transform valid vite config", async () => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: []
});
`
			);

			expect(() => transformViteConfig(".")).not.toThrow();
		});
	});
});
