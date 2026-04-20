import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { beforeEach, describe, it } from "vitest";
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
		it("should detect cloudflare plugin in function-based defineConfig", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig(() => ({
  plugins: [cloudflare()]
}));
`
			);

			const result = checkIfViteConfigUsesCloudflarePlugin(".");
			expect(result).toBe(true);
		});

		it("should return false for function-based defineConfig without cloudflare plugin", async ({
			expect,
		}) => {
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
		});

		it("should handle vite config without plugins array", async ({
			expect,
		}) => {
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

		it("should detect cloudflare plugin correctly", async ({ expect }) => {
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
		it("should successfully transform function-based defineConfig with arrow expression body", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: []
}));
`
			);

			expect(() => transformViteConfig(".")).not.toThrow();
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(result).toContain("cloudflare()");
		});

		it("should successfully transform function-based defineConfig with destructured params", async ({
			expect,
		}) => {
			// This is the exact pattern from the React Router node-postgres template
			await writeFile(
				"vite.config.ts",
				`
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: isSsrBuild
      ? {
          input: "./server/app.ts",
        }
      : undefined,
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
}));
`
			);

			expect(() => transformViteConfig(".")).not.toThrow();
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(result).toContain("cloudflare()");
			// The existing plugins should be preserved
			expect(result).toContain("tailwindcss()");
			expect(result).toContain("reactRouter()");
			expect(result).toContain("tsconfigPaths()");
			// The function structure should be preserved
			expect(result).toContain("isSsrBuild");
		});

		it("should successfully transform function-based defineConfig with block body", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: []
  };
});
`
			);

			expect(() => transformViteConfig(".")).not.toThrow();
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(result).toContain("cloudflare()");
		});

		it("should successfully transform function expression defineConfig", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(function() {
  return {
    plugins: []
  };
});
`
			);

			expect(() => transformViteConfig(".")).not.toThrow();
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(result).toContain("cloudflare()");
		});

		it("should pass viteEnvironmentName option with function-based config", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: []
}));
`
			);

			expect(() =>
				transformViteConfig(".", { viteEnvironmentName: "ssr" })
			).not.toThrow();
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).toContain("viteEnvironment");
			expect(result).toContain('"ssr"');
		});

		it("should remove incompatible plugins from function-based config", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [nitro(), someOther()]
}));
`
			);

			expect(() => transformViteConfig(".")).not.toThrow();
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).not.toContain("nitro()");
			expect(result).toContain("someOther()");
			expect(result).toContain("cloudflare()");
		});

		it("should throw UserError when plugins array is missing", async ({
			expect,
		}) => {
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

		it("should throw UserError when plugins array is missing in function-based config", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  server: { port: 3000 }
}));
`
			);

			expect(() => transformViteConfig(".")).toThrowError(
				/Cannot modify Vite config: could not find a valid plugins array/
			);
		});

		it("should successfully transform valid vite config", async ({
			expect,
		}) => {
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
