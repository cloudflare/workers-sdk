import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { InputWorkerSchema } from "../schema";

// Vitest's module runner intercepts dynamic imports before Node's
// `module.registerHooks` can see them, so we cannot exercise `loadConfig`
// inside a test directly. Instead, we run a small Node program in a
// subprocess that calls `loadConfig`, serialises the result as JSON, and
// prints it to stdout for the test to consume.
function runLoadConfigInSubprocess(args: { cwd: string; configPath: string }): {
	config: unknown;
	dependencies: string[];
} {
	// Use a file:// URL rather than a raw filesystem path so the embedded
	// `import` specifier is valid on Windows (where absolute paths like
	// `C:\...` are not accepted as ESM specifiers).
	const sourceEntry = pathToFileURL(path.resolve(__dirname, "../load.ts")).href;
	const script = `
		import { loadConfig } from ${JSON.stringify(sourceEntry)};
		const result = await loadConfig(${JSON.stringify(args.configPath)});
		const serialisable = {
			config: result.config,
			dependencies: [...result.dependencies],
		};
		process.stdout.write(JSON.stringify(serialisable, (_, v) => {
			// Module namespace objects have a null prototype; convert to plain
			// objects so JSON.stringify captures their enumerable string keys.
			if (v && typeof v === "object" && Object.getPrototypeOf(v) === null) {
				return { ...v };
			}
			return v;
		}));
	`;
	const result = spawnSync(
		process.execPath,
		["--input-type=module", "-e", script],
		{ cwd: args.cwd, encoding: "utf8" }
	);
	if (result.status !== 0) {
		throw new Error(
			`Subprocess failed (status ${result.status}):\n${result.stderr}`
		);
	}
	return JSON.parse(result.stdout);
}

describe("loadConfig", () => {
	runInTempDir();

	it("returns the module's default export verbatim for a plain config", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default { name: "my-worker" };`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		expect(result.config).toEqual({ name: "my-worker" });
	});

	it("anchors relative cf-worker specifiers to an absolute path without executing them", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": `throw new Error("entrypoint must not be executed at config load time");`,
			"cloudflare.config.ts": `
				import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
				export default { name: "w", entrypoint };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		// The relative specifier is anchored to the importing module and
		// emitted as an absolute path, but the entrypoint is never loaded or
		// executed.
		expect(
			(result.config as { entrypoint: { default: string } }).entrypoint
		).toEqual({ default: path.resolve("src/index.ts") });
		// The entrypoint is referenced for its specifier only; changes to
		// its source must not trigger a config reload, so it is not tracked.
		expect(result.dependencies).not.toContain(path.resolve("src/index.ts"));
		// The config file itself is still tracked.
		expect(result.dependencies).toContain(path.resolve("cloudflare.config.ts"));
	});

	it("anchors relative cf-worker specifiers to the importing module, not the top-level config", async ({
		expect,
	}) => {
		await seed({
			"nested/src/index.ts": `throw new Error("entrypoint must not be executed at config load time");`,
			"nested/sub.config.ts": `
				import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
				export default { name: "w", entrypoint };
			`,
			"cloudflare.config.ts": `export { default } from "./nested/sub.config.ts";`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		// `./src/index.ts` is written in `nested/sub.config.ts`, so it must
		// resolve relative to that file — not the top-level config file.
		expect(
			(result.config as { entrypoint: { default: string } }).entrypoint
		).toEqual({ default: path.resolve("nested/src/index.ts") });
	});

	it("passes bare and virtual cf-worker specifiers through verbatim", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `
				import * as bare from "@example-package/some-module" with { type: "cf-worker" };
				import * as virtual from "virtual:some-module" with { type: "cf-worker" };
				export default { name: "w", bare, virtual };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		expect(
			result.config as {
				bare: { default: string };
				virtual: { default: string };
			}
		).toMatchObject({
			bare: { default: "@example-package/some-module" },
			virtual: { default: "virtual:some-module" },
		});
	});

	it("produces an entrypoint namespace that InputWorkerSchema.parse collapses to a string", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": `// not executed`,
			"cloudflare.config.ts": `
				import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
				export default { name: "worker", compatibilityDate: "2026-06-01", entrypoint };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});
		const parsed = InputWorkerSchema.parse(result.config);

		expect(parsed.entrypoint).toBe(path.resolve("src/index.ts"));
	});

	it("reloads the config when the file changes between calls in the same process", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default { name: "first" };`,
		});

		const sourceEntry = pathToFileURL(
			path.resolve(__dirname, "../load.ts")
		).href;
		const script = `
			import { writeFileSync } from "node:fs";
			import { loadConfig } from ${JSON.stringify(sourceEntry)};
			const first = await loadConfig("./cloudflare.config.ts");
			writeFileSync("./cloudflare.config.ts", 'export default { name: "second" };');
			const second = await loadConfig("./cloudflare.config.ts");
			process.stdout.write(JSON.stringify({
				first: first.config,
				second: second.config,
			}));
		`;
		const sub = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{ cwd: process.cwd(), encoding: "utf8" }
		);
		if (sub.status !== 0) {
			throw new Error(`Subprocess failed: ${sub.stderr}`);
		}
		const parsed = JSON.parse(sub.stdout) as {
			first: { name: string };
			second: { name: string };
		};
		expect(parsed.first.name).toBe("first");
		expect(parsed.second.name).toBe("second");
	});

	it("collects file paths imported while resolving the config into dependencies", async ({
		expect,
	}) => {
		await seed({
			"helper.ts": `export const value = 42;`,
			"cloudflare.config.ts": `
				import { value } from "./helper.ts";
				export default { name: "w", value };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		const configPath = path.resolve("cloudflare.config.ts");
		const helperPath = path.resolve("helper.ts");
		expect(result.dependencies).toContain(configPath);
		expect(result.dependencies).toContain(helperPath);
	});

	it("does not track node_modules imports as dependencies", async ({
		expect,
	}) => {
		await seed({
			"node_modules/fake-pkg/package.json": JSON.stringify({
				name: "fake-pkg",
				type: "module",
				main: "./index.mjs",
			}),
			"node_modules/fake-pkg/index.mjs": `export const value = "from-pkg";`,
			"cloudflare.config.ts": `
				import { value } from "fake-pkg";
				export default { name: "w", value };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		const pkgPath = path.resolve("node_modules/fake-pkg/index.mjs");
		expect(result.dependencies).not.toContain(pkgPath);
		// Sanity: the config file itself is still tracked.
		expect(result.dependencies).toContain(path.resolve("cloudflare.config.ts"));
	});
});
