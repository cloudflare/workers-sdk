import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test, vi } from "vitest";
import sveltePages from "../../templates/svelte/pages/c3";
import svelteWorkers from "../../templates/svelte/workers/c3";
import { createTestContext } from "./helpers";

vi.mock("helpers/packages", () => ({ installPackages: vi.fn() }));

describe("SvelteKit configuration", () => {
	runInTempDir();

	test.for([
		["Workers", svelteWorkers],
		["Pages", sveltePages],
	] as const)(
		"updates the %s adapter in a JavaScript configuration containing object spread",
		async ([, template], { expect }) => {
			const ctx = createTestContext();
			ctx.project.path = process.cwd();
			const source = `import adapter from "@sveltejs/adapter-auto";
import { defineConfig } from "vite";

const shared = { server: { port: 5173 } };
export default defineConfig({
	...shared,
	plugins: [adapter()]
});
`;
			writeFileSync("vite.config.js", source);
			const configure = template.configure;
			if (!configure) {
				throw new Error(
					"The SvelteKit template must configure the Cloudflare adapter"
				);
			}
			await configure(ctx);
			expect(
				readFileSync("vite.config.js", "utf8").replaceAll("\r\n", "\n")
			).toBe(
				source
					.replace("@sveltejs/adapter-auto", "@sveltejs/adapter-cloudflare")
					.trimEnd()
			);
		}
	);
});

describe("SvelteKit Workers scripts", () => {
	runInTempDir();

	test.for(["ts", "js"])(
		"generates scripts for a %s project",
		async (language, { expect }) => {
			const ctx = createTestContext();
			mkdirSync(ctx.project.path);
			if (language === "ts") {
				writeFileSync(join(ctx.project.path, "tsconfig.json"), "{}");
			}
			const transform = svelteWorkers.transformPackageJson;
			if (!transform) {
				throw new Error(
					"The SvelteKit Workers template must transform package scripts"
				);
			}
			const result = await transform(
				{ name: "svelte-app", version: "1.0.0" },
				ctx
			);
			expect(result.scripts).toMatchObject({
				preview: expect.stringContaining("run build && wrangler dev"),
				deploy: expect.stringContaining("run build && wrangler deploy"),
			});
			if (language === "ts") {
				expect(result.scripts).toHaveProperty(
					"cf-typegen",
					"wrangler types --include-main-module=false ./src/worker-configuration.d.ts"
				);
			} else {
				expect(result.scripts).not.toHaveProperty("cf-typegen");
			}
		}
	);
});
