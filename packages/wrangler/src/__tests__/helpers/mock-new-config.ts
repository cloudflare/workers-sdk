import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Shared `@cloudflare/config` mock
// ─────────────────────────────────────────────────────────────────────────────
//
// `loadNewConfig` calls into `@cloudflare/config`'s `loadConfig`, which uses
// `module.registerHooks` to register hooks for `.ts` files and `cf-worker`
// import attributes. That mechanism does not run inside vitest's module
// runner, so we cannot invoke the real loader here.
//
// Mocking `loadConfig` lets us "load" arbitrary seeded files inside the temp
// dir without going through Node's module hooks. We `import("data:...")` to
// evaluate the file as ESM so the function-form configs work naturally.
// ─────────────────────────────────────────────────────────────────────────────

export async function createConfigMock(importOriginal: () => Promise<unknown>) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock plumbing
	const actual = (await importOriginal()) as Record<string, any>;

	async function importSeeded(
		configPath: string
	): Promise<Record<string, unknown>> {
		const source = await fs.promises.readFile(configPath, "utf8");
		// Evaluate via a data URL — preserves ESM semantics (top-level await,
		// default export, etc.) without triggering Node's `.ts` hooks.
		return (await import(
			`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
		)) as Record<string, unknown>;
	}

	async function loadConfig(configPath: string) {
		const exports = await importSeeded(configPath);
		return {
			exports,
			dependencies: new Set<string>([path.resolve(configPath)]),
		};
	}

	async function loadAndValidateConfig(configPath: string, ctx: unknown) {
		const { exports } = await loadConfig(configPath);
		const resolved: Record<string, unknown> = {};
		for (const [name, value] of Object.entries(exports)) {
			resolved[name] = await actual.resolveExportDefinition(value, ctx);
		}
		return {
			result: actual.ConfigExportsSchema.safeParse(resolved),
			dependencies: new Set<string>([path.resolve(configPath)]),
		};
	}

	return {
		...actual,
		loadConfig,
		loadAndValidateConfig,
	};
}
