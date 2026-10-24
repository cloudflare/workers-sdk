import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import svelteWorkers from "../../templates/svelte/workers/c3";
import { createTestContext } from "./helpers";

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
