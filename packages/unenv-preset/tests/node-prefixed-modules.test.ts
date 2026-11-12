import { defineEnv } from "unenv";
import { describe, expect, test } from "vitest";
import { getCloudflarePreset } from "../src/index";

/**
 * Some Node.js built-in modules can only be imported with the `node:` prefix
 * (they are not listed without it in `module.builtinModules`).
 * A bare specifier such as `sqlite` refers to an npm package, not to Node.js.
 *
 * See https://github.com/cloudflare/workers-sdk/issues/12736
 */
describe("modules that are only available with the `node:` prefix", () => {
	// Resolve the environment the same way Wrangler and the Vite plugin do.
	function resolveEnv(compatibilityDate: string, compatibilityFlags: string[]) {
		return defineEnv({
			presets: [
				getCloudflarePreset({
					compatibilityDate,
					compatibilityFlags: ["nodejs_compat", ...compatibilityFlags],
				}),
			],
			npmShims: true,
		}).env;
	}

	describe.each([
		{ name: "native sqlite enabled by date", date: "2026-01-29", flags: [] },
		{
			name: "native sqlite enabled by flag",
			date: "2025-09-01",
			flags: ["enable_nodejs_sqlite_module"],
		},
	])("$name", ({ date, flags }) => {
		test("`node:sqlite` is aliased to the native workerd module and is external", () => {
			const { alias, external } = resolveEnv(date, flags);

			expect(alias["node:sqlite"]).toBe("node:sqlite");
			expect(external).toContain("node:sqlite");
		});

		test("bare `sqlite` is not aliased to a Node.js built-in", () => {
			const { alias } = resolveEnv(date, flags);

			expect(alias).not.toHaveProperty("sqlite");
		});

		test("bare `sqlite` is not marked as external", () => {
			const { external } = resolveEnv(date, flags);

			expect(external).not.toContain("sqlite");
		});
	});
});
