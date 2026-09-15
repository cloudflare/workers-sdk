import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("uses the new module registry fallback protocol", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			miniflare: {
				compatibilityDate: "2026-08-10",
				compatibilityFlags: ["new_module_registry"],
			},
		}),
		"dependency.cjs": dedent`
				exports.named = 42;
				exports.defaultValue = "commonjs";
			`,
		"helper.ts": "export const value = 42;",
		"node_modules/nmr-test-dependency/package.json": JSON.stringify({
			name: "nmr-test-dependency",
			type: "module",
			exports: "./index.mjs",
		}),
		"node_modules/nmr-test-dependency/index.mjs": dedent`
				export function load(name) {
					return import(\`./\${name}.mjs\`);
				}
			`,
		"node_modules/nmr-test-dependency/value.mjs": "export const value = 42;",
		"index.test.ts": dedent`
				import dependency, { named } from "./dependency.cjs";
				import { it } from "vitest";
				import { load } from "nmr-test-dependency";

				it("uses native module registry semantics", async ({ expect }) => {
					expect(dependency.defaultValue).toBe("commonjs");
					expect(named).toBe(42);
					expect(import.meta.resolve("./helper.ts")).toBe(
						new URL("./helper.ts", import.meta.url).href
					);
					const helper = await import(import.meta.resolve("./helper.ts"));
					expect(helper.value).toBe(42);

					const computed = await load("value");
					expect(computed.value).toBe(42);
				});
			`,
	});

	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);
});

test("keeps using the legacy fallback protocol when explicitly requested", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			miniflare: {
				compatibilityDate: "2026-08-10",
				compatibilityFlags: ["legacy_module_registry"],
			},
		}),
		"dependency.cjs": "exports.value = 42;",
		"index.test.ts": dedent`
				import dependency, { value } from "./dependency.cjs";
				import { it } from "vitest";

				it("uses legacy module registry semantics", ({ expect }) => {
					expect(dependency.value).toBe(42);
					expect(value).toBe(42);
				});
			`,
	});

	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);
});
