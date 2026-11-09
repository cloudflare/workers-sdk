import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
	mockConsoleMethods,
	runInTempDir,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	transformViteConfig,
} from "../src/frameworks/utils/vite-config";
import { createMockContext } from "./helpers/mock-context";

describe("vite-config utils", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	describe("checkIfViteConfigUsesCloudflarePlugin", () => {
		it.for(["plugins", '"plugins"', '["plugins"]'])(
			"detects the final %s array after a spread in JavaScript config",
			async (key, { expect }) => {
				await writeFile(
					"vite.config.js",
					`import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const shared = { plugins: [] };
export default defineConfig({
  plugins: [],
  ...shared,
  ${key}: [cloudflare()]
});
`
				);

				expect(checkIfViteConfigUsesCloudflarePlugin(".", context)).toBe(true);
			}
		);

		it.for(["js", "ts"])(
			"does not detect a plugin that a later spread can override in %s config",
			async (extension, { expect }) => {
				const filePath = `vite.config.${extension}`;
				const content = `import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

const shared = { plugins: [react()] };
export default defineConfig({
  plugins: [cloudflare()],
  ...shared
});
`;
				await writeFile(filePath, content);

				expect(checkIfViteConfigUsesCloudflarePlugin(".", context)).toBe(false);
				expect(readFileSync(filePath, "utf8")).toBe(content);
			}
		);

		it.for(["\n", "\r\n"])(
			"preserves the config file with %j line endings",
			async (lineEnding, { expect }) => {
				const content = [
					'import { defineConfig } from "vite";',
					'import { cloudflare } from "@cloudflare/vite-plugin";',
					"export default defineConfig({ plugins: [cloudflare()] });",
					"",
				].join(lineEnding);
				await writeFile("vite.config.ts", content);

				expect(checkIfViteConfigUsesCloudflarePlugin(".", context)).toBe(true);
				expect(readFileSync("vite.config.ts", "utf8")).toBe(content);
			}
		);

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

			const result = checkIfViteConfigUsesCloudflarePlugin(".", context);
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

			const result = checkIfViteConfigUsesCloudflarePlugin(".", context);
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

			const result = checkIfViteConfigUsesCloudflarePlugin(".", context);
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

			const result = checkIfViteConfigUsesCloudflarePlugin(".", context);
			expect(result).toBe(true);
		});
	});

	describe("transformViteConfig", () => {
		it.for([
			"[overrideKey]: shared.plugins",
			"get plugins() { return shared.plugins; }",
		])("rejects a later plugins override: %s", async (override, { expect }) => {
			const content = `import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const overrideKey = "plugins";
const shared = { plugins: [] };
export default defineConfig({
  "plugins": [cloudflare()],
  ${override}
});
`;
			await writeFile("vite.config.js", content);

			expect(checkIfViteConfigUsesCloudflarePlugin(".", context)).toBe(false);
			expect(() => transformViteConfig(".")).toThrow(
				/Cannot modify Vite config: a later property may override the plugins array/
			);
			expect(readFileSync("vite.config.js", "utf8")).toBe(content);
		});

		it.for(["1", '"server"', '["server"]'])(
			"allows an unrelated static %s property after plugins",
			async (key, { expect }) => {
				await writeFile(
					"vite.config.js",
					`import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  ${key}: {}
});
`
				);

				transformViteConfig(".");

				expect(readFileSync("vite.config.js", "utf8")).toContain(
					"plugins: [cloudflare()]"
				);
			}
		);

		it.for(["plugins", '"plugins"', '["plugins"]'])(
			"updates the final %s array after a spread in JavaScript config",
			async (key, { expect }) => {
				await writeFile(
					"vite.config.js",
					`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const shared = { plugins: [] };
export default defineConfig({
  plugins: [],
  ...shared,
  ${key}: [react()]
});
`
				);

				transformViteConfig(".");

				const result = readFileSync("vite.config.js", "utf8");
				expect(result).toContain(`${key}: [react(), cloudflare()]`);
				expect(checkIfViteConfigUsesCloudflarePlugin(".", context)).toBe(true);
			}
		);

		it.for(["js", "ts"])(
			"leaves %s config unchanged when a later spread can override plugins",
			async (extension, { expect }) => {
				const filePath = `vite.config.${extension}`;
				const content = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const shared = { plugins: [react()] };
export default defineConfig({
  plugins: [],
  ...shared
});
`;
				await writeFile(filePath, content);

				expect(() => transformViteConfig(".")).toThrow(
					/Cannot modify Vite config: a later property may override the plugins array/
				);
				expect(readFileSync(filePath, "utf8")).toBe(content);
			}
		);

		it.for(["js", "ts"])(
			"adds the plugin to %s config when the plugins array follows object spreads",
			async (extension, { expect }) => {
				const filePath = `vite.config.${extension}`;
				await writeFile(
					filePath,
					`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const shared = { plugins: [] };
export default defineConfig({
  ...shared,
  plugins: [react()]
});
`
				);

				transformViteConfig(".");

				expect(readFileSync(filePath, "utf8")).toMatch(
					/\.\.\.shared,\s+plugins: \[react\(\), cloudflare\(\)\]/
				);
				expect(checkIfViteConfigUsesCloudflarePlugin(".", context)).toBe(true);
			}
		);

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
import { nitro, keepMe } from 'nitro/vite';

export default defineConfig(() => ({
  plugins: [nitro(), keepMe(), someOther()]
}));
`
			);

			transformViteConfig(".");
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result).not.toContain("nitro()");
			expect(result).toContain("import { keepMe } from 'nitro/vite'");
			expect(result).toContain("keepMe()");
			expect(result).toContain("someOther()");
			expect(result).toContain("cloudflare()");
		});

		it("should preserve incompatible plugin imports that are still referenced", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';
import { nitro, nitro as nitroPlugin } from 'nitro/vite';

export default defineConfig({
  nitroOptions: nitro,
  plugins: [nitro(), enabled ? nitro() : undefined, nitroPlugin()]
});
`
			);

			transformViteConfig(".");
			const result = readFileSync("vite.config.ts", "utf-8");
			expect(result.match(/nitro\(\)/g)).toHaveLength(1);
			expect(result).toContain("enabled ? nitro() : undefined");
			expect(result).toContain("nitroPlugin()");
			expect(result).toContain("from 'nitro/vite'");
			expect(result).toContain("nitroOptions: nitro");
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

			expect(() => transformViteConfig(".")).toThrow(
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

			expect(() => transformViteConfig(".")).toThrow(
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
