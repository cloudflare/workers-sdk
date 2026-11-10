import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
	mockConsoleMethods,
	runInTempDir,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	checkIfExportedViteConfigUsesCloudflarePlugin,
	hasViteConfig,
	transformViteConfig,
} from "../src/frameworks/utils/vite-config";
import { createMockContext } from "./helpers/mock-context";

describe("vite-config utils", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	describe("checkIfExportedViteConfigUsesCloudflarePlugin", () => {
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

				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
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

				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(false);
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

				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
				expect(readFileSync("vite.config.ts", "utf8")).toBe(content);
			}
		);

		it.for(["ts", "js", "mts", "mjs", "cts", "cjs"])(
			"detects an aliased plugin in a plain .%s config",
			async (extension, { expect }) => {
				await writeFile(
					`vite.config.${extension}`,
					`import { cloudflare as workers } from '@cloudflare/vite-plugin'; export default { plugins: [workers()] };`
				);
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
			}
		);

		it("detects a namespace plugin import", async ({ expect }) => {
			await writeFile(
				"vite.config.ts",
				`import * as workers from '@cloudflare/vite-plugin'; export default { plugins: [workers.cloudflare()] };`
			);
			expect(checkIfExportedViteConfigUsesCloudflarePlugin(".", context)).toBe(
				true
			);
		});

		it.for([
			"const config = defineConfig({ plugins: [cloudflare()] }); export default config;",
			"const config = { plugins: [cloudflare()] }; export default config;",
			"const base = { plugins: [cloudflare()] }; const config = defineConfig(base); export default config;",
			"export const config = defineConfig({ plugins: [cloudflare()] }); export default config;",
			"export default defineConfig({ plugins: [cloudflare()] }) satisfies UserConfig;",
			"export default ({ plugins: [cloudflare()] } satisfies UserConfig);",
			"export default ({ plugins: [cloudflare()] } as UserConfig);",
			"const config = defineConfig({ plugins: [cloudflare()] }) as UserConfig; export default config;",
		])(
			"recognizes exported bindings and TypeScript wrappers: %s",
			async (config, { expect }) => {
				await writeFile(
					"vite.config.ts",
					`import { cloudflare } from '@cloudflare/vite-plugin'; import { defineConfig, type UserConfig } from 'vite'; ${config}`
				);
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
			}
		);

		it.for([
			"const config = { plugins: [cloudflare()] }; config.plugins = []; export default config;",
			"let config = defineConfig({ plugins: [cloudflare()] }); config = defineConfig({ plugins: [] }); export default config;",
			"const config = defineConfig({ plugins: [cloudflare()] }); const alias = config; alias.plugins = []; export default config;",
			"const base = { plugins: [cloudflare()] }; const config = defineConfig(base); base.plugins = []; export default config;",
			"const config = { plugins: [cloudflare()] }; config.plugins.splice(0); export default config;",
			"const config = { plugins: [cloudflare()] }; config.plugins['splice'](0); export default config;",
			"const config = { plugins: [cloudflare()] }; config.plugins.length--; export default config;",
			"const config = { plugins: [cloudflare()] }; delete config.plugins; export default config;",
			"const config = { plugins: [cloudflare()] }; config[key] = []; export default config;",
		])(
			"does not confirm a plugin after the config is mutated: %s",
			async (config, { expect }) => {
				await writeFile(
					"vite.config.ts",
					`import { cloudflare } from '@cloudflare/vite-plugin'; import { defineConfig } from 'vite'; ${config}`
				);
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(false);
			}
		);

		it("allows unrelated property writes and shadowed config bindings", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`import { cloudflare } from '@cloudflare/vite-plugin'; const config = { plugins: [cloudflare()] }; config.server = {}; function other(config) { config.plugins = []; } export default config;`
			);
			expect(checkIfExportedViteConfigUsesCloudflarePlugin(".", context)).toBe(
				true
			);
		});

		it.for([
			"export default mergeConfig(base, defineConfig({ plugins: [cloudflare()] }));",
			"export default () => defineConfig({ plugins: [cloudflare()] });",
			"const config = defineConfig({ plugins: [cloudflare()] }); export { config as default };",
		])(
			"does not confirm wrapped or indirect exports: %s",
			async (config, { expect }) => {
				await writeFile(
					"vite.config.ts",
					`import { cloudflare } from '@cloudflare/vite-plugin'; import { defineConfig, mergeConfig } from 'vite'; ${config}`
				);
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(false);
			}
		);

		it.for([
			["js", "mjs"],
			["mjs", "ts"],
			["ts", "cjs"],
			["cjs", "mts"],
			["mts", "cts"],
		])(
			"uses Vite's file precedence for .%s before .%s",
			async ([first, second], { expect }) => {
				const enabled =
					"import { cloudflare } from '@cloudflare/vite-plugin'; export default { plugins: [cloudflare()] };";
				const disabled = "export default { plugins: [] };";
				await writeFile(`vite.config.${first}`, enabled);
				await writeFile(`vite.config.${second}`, disabled);
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
				await writeFile(`vite.config.${first}`, disabled);
				await writeFile(`vite.config.${second}`, enabled);
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(false);
			}
		);

		it("ignores unused config objects", async ({ expect }) => {
			await writeFile(
				"vite.config.ts",
				`import { cloudflare } from '@cloudflare/vite-plugin'; import { defineConfig } from 'vite'; const unused = defineConfig({ plugins: [cloudflare()] }); export default defineConfig({ plugins: [] });`
			);
			expect(checkIfExportedViteConfigUsesCloudflarePlugin(".", context)).toBe(
				false
			);
		});

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

			const result = checkIfExportedViteConfigUsesCloudflarePlugin(
				".",
				context
			);
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

			const result = checkIfExportedViteConfigUsesCloudflarePlugin(
				".",
				context
			);
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

			const result = checkIfExportedViteConfigUsesCloudflarePlugin(
				".",
				context
			);
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

			const result = checkIfExportedViteConfigUsesCloudflarePlugin(
				".",
				context
			);
			expect(result).toBe(true);
		});
	});

	describe("transformViteConfig", () => {
		it.for(["export type Config = {};", "export const helper = true;"])(
			"rejects CommonJS exports alongside TypeScript exports: %s",
			async (namedExport, { expect }) => {
				const content = `${namedExport} const { defineConfig } = require('vite'); module.exports = defineConfig({ plugins: [] });`;
				await writeFile("vite.config.cts", content);
				expect(() => transformViteConfig(".")).toThrow(
					"Cannot automatically modify a CommonJS Vite configuration"
				);
				expect(readFileSync("vite.config.cts", "utf8")).toBe(content);
			}
		);

		it.for(["cjs", "cts"])(
			"detects .%s configurations without rewriting CommonJS",
			async (extension, { expect }) => {
				const filePath = `vite.config.${extension}`;
				const content =
					"const { defineConfig } = require('vite'); module.exports = defineConfig({ plugins: [] });";
				await writeFile(filePath, content);
				expect(hasViteConfig(".")).toBe(true);
				expect(() => transformViteConfig(".")).toThrow(
					"Cannot automatically modify a CommonJS Vite configuration"
				);
				expect(readFileSync(filePath, "utf8")).toBe(content);
			}
		);

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

			expect(checkIfExportedViteConfigUsesCloudflarePlugin(".", context)).toBe(
				false
			);
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
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
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
				expect(
					checkIfExportedViteConfigUsesCloudflarePlugin(".", context)
				).toBe(true);
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
