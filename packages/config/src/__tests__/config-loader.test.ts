import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { loadAndValidateConfig } from "../config-loader";

// These tests exercise `loadAndValidateConfig` in-process: vitest's module
// runner evaluates the seeded `cloudflare.config.ts` for us, which is enough
// for the export-selection behaviour under test. `loadConfig`'s Node module
// hooks (the `cf-worker` attribute, cache-busting, dependency tracking) need a
// real Node process and are covered separately in `load.test.ts`.

/**
 * Load the `cloudflare.config.ts` seeded into the current temp dir.
 *
 * @param options Forwarded to `loadAndValidateConfig`.
 * @returns The Zod result for the validated exports.
 */
async function load(options?: { include?: string[]; mode?: string }) {
	const { result } = await loadAndValidateConfig(
		path.resolve("cloudflare.config.ts"),
		{ mode: options?.mode },
		options?.include ? { include: options.include } : undefined
	);

	return result;
}

describe("loadAndValidateConfig", () => {
	runInTempDir();

	describe("recognised exports", () => {
		it("resolves and validates the `default` and `settings` exports", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default { type: "worker", name: "my-worker", compatibilityDate: "2026-05-18" };
					export const settings = { type: "settings", accountId: "acc-123" };
				`,
			});

			const result = await load();

			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				default: { type: "worker", name: "my-worker" },
				settings: { type: "settings", accountId: "acc-123" },
			});
		});

		it("resolves the function form of `default`, passing the config context", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default (ctx) => ({
						type: "worker",
						name: \`worker-\${ctx.mode}\`,
						compatibilityDate: "2026-05-18",
					});
				`,
			});

			const result = await load({ mode: "staging" });

			expect(result.success).toBe(true);
			expect(result.data?.default).toMatchObject({ name: "worker-staging" });
		});

		it("resolves the promise form of `default` and `settings`", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default Promise.resolve({ type: "worker", name: "async-worker", compatibilityDate: "2026-05-18" });
					export const settings = Promise.resolve({ type: "settings", accountId: "acc-async" });
				`,
			});

			const result = await load();

			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				default: { name: "async-worker" },
				settings: { accountId: "acc-async" },
			});
		});
	});

	describe("unrecognised exports", () => {
		it("ignores an extra named export instead of validating it", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export const WORKER_NAMES = { primary: "my-worker" };
					export default { type: "worker", name: WORKER_NAMES.primary, compatibilityDate: "2026-05-18" };
				`,
			});

			const result = await load();

			expect(result.success).toBe(true);
			expect(Object.keys(result.data ?? {})).toEqual(["default"]);
		});

		it("does not invoke an extra exported function", async ({ expect }) => {
			const marker = path.resolve("helper-was-called.txt");
			await seed({
				"cloudflare.config.ts": `
					import { writeFileSync } from "node:fs";

					export function buildName() {
						writeFileSync(${JSON.stringify(marker)}, "called");
						return "from-helper";
					}

					export default { type: "worker", name: "my-worker", compatibilityDate: "2026-05-18" };
				`,
			});

			const result = await load();

			// Resolving an export calls it when it is a function, so an exported
			// helper must never reach the resolver.
			expect(fs.existsSync(marker)).toBe(false);
			expect(result.success).toBe(true);
		});
	});

	describe("validation", () => {
		it("rejects a non-settings config on the `settings` export", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default { type: "worker", name: "my-worker", compatibilityDate: "2026-05-18" };
					export const settings = { type: "worker", name: "not-settings", compatibilityDate: "2026-05-18" };
				`,
			});

			const result = await load();

			expect(result.success).toBe(false);
			expect(result.error?.issues).toContainEqual(
				expect.objectContaining({
					path: ["settings"],
					message:
						"The `settings` export is reserved for a `settings` config; found a `worker` config.",
				})
			);
		});

		it("rejects a settings config on the `default` export", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default { type: "settings", accountId: "acc-123" };
				`,
			});

			const result = await load();

			expect(result.success).toBe(false);
			expect(result.error?.issues).toContainEqual(
				expect.objectContaining({
					path: ["default"],
					message:
						"A `settings` config is only allowed on the `settings` export; found one on the `default` export.",
				})
			);
		});

		it("still validates the `default` export itself", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts": `
					export default { type: "worker", name: 42, compatibilityDate: "2026-05-18" };
				`,
			});

			const result = await load();

			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(["default", "name"]);
		});
	});

	describe("include override", () => {
		it("resolves and validates additional exports when asked to", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default { type: "worker", name: "primary", compatibilityDate: "2026-05-18" };
					export const other = { type: "worker", name: 42, compatibilityDate: "2026-05-18" };
				`,
			});

			expect((await load()).success).toBe(true);

			const widened = await load({ include: ["default", "other"] });

			expect(widened.success).toBe(false);
			expect(widened.error?.issues[0]?.path).toEqual(["other", "name"]);
		});
	});
});
