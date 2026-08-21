import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { InputWorkerSchema } from "../schema";

// Use a file:// URL rather than a raw filesystem path so the embedded
// `import` specifier is valid on Windows (where absolute paths like
// `C:\...` are not accepted as ESM specifiers).
const SOURCE_ENTRY = pathToFileURL(path.resolve(__dirname, "../load.ts")).href;

// Subprocess snippet that reports whether the config hooks are currently
// installed in Node's hook chain. While they are, a `cf-worker` import is
// short-circuited to a synthetic module whose default export is the entrypoint
// path — tests pair this with an `src/index.ts` that has no default export of
// its own, so a string default can only have come from the hooks.
const CF_WORKER_PROBE = `
	async function hooksInstalled() {
		try {
			const mod = await import(
				"./src/index.ts?probe=" + Math.random(),
				{ with: { type: "cf-worker" } }
			);
			return typeof mod.default === "string";
		} catch {
			return false;
		}
	}
`;

/**
 * Run an ES module script in a Node subprocess and parse its stdout as JSON.
 *
 * @param script Module source to evaluate. It must write a JSON payload to
 *   `process.stdout`.
 * @param cwd Working directory for the subprocess. Defaults to the test's
 *   temporary directory.
 * @returns The parsed JSON payload written by the script.
 */
function runScriptInSubprocess<T>(script: string, cwd = process.cwd()): T {
	const result = spawnSync(
		process.execPath,
		["--input-type=module", "-e", script],
		{
			cwd,
			encoding: "utf8",
		}
	);
	if (result.status !== 0) {
		throw new Error(
			`Subprocess failed (status ${result.status}):\n${result.stderr}`
		);
	}
	return JSON.parse(result.stdout) as T;
}

// Vitest's module runner intercepts dynamic imports before Node's
// `module.registerHooks` can see them, so we cannot exercise `loadConfig`
// inside a test directly. Instead, we run a small Node program in a
// subprocess that calls `loadConfig`, serialises the result as JSON, and
// prints it to stdout for the test to consume.
function runLoadConfigInSubprocess(args: {
	cwd: string;
	configPath: string;
	include?: string[];
}): {
	config: unknown;
	exports: Record<string, unknown>;
	dependencies: string[];
} {
	const options = args.include
		? `, { include: ${JSON.stringify(args.include)} }`
		: "";
	const script = `
		import { loadConfig } from ${JSON.stringify(SOURCE_ENTRY)};
		const result = await loadConfig(${JSON.stringify(args.configPath)}${options});
		const serialisable = {
			config: result.exports.default,
			exports: result.exports,
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
	return runScriptInSubprocess(script, args.cwd);
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

	it("returns all named exports keyed by name", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `
				export default { type: "worker", name: "w" };
				export const settings = { type: "settings", accountId: "acc-123" };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
		});

		expect(result.exports.default).toEqual({ type: "worker", name: "w" });
		expect(result.exports.settings).toEqual({
			type: "settings",
			accountId: "acc-123",
		});
	});

	it("filters exports by `include` before resolution", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `
				export default { type: "worker", name: "w" };
				export const settings = { type: "settings" };
			`,
		});

		const result = runLoadConfigInSubprocess({
			cwd: process.cwd(),
			configPath: "./cloudflare.config.ts",
			include: ["settings"],
		});

		expect(Object.keys(result.exports)).toEqual(["settings"]);
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
				export default { type: "worker", name: "worker", compatibilityDate: "2026-06-01", entrypoint };
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

		const parsed = runScriptInSubprocess<{
			first: { name: string };
			second: { name: string };
		}>(`
			import { writeFileSync } from "node:fs";
			import { loadConfig } from ${JSON.stringify(SOURCE_ENTRY)};
			const first = await loadConfig("./cloudflare.config.ts");
			writeFileSync("./cloudflare.config.ts", 'export default { name: "second" };');
			const second = await loadConfig("./cloudflare.config.ts");
			process.stdout.write(JSON.stringify({
				first: first.exports.default,
				second: second.exports.default,
			}));
		`);
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

	it("releases the module hooks once the load has finished", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": `// not executed`,
			"cloudflare.config.ts": `
				import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
				export default { name: "w", entrypoint };
			`,
			"plain.ts": `export const value = "plain";`,
		});

		// While the hooks are installed, a `cf-worker` import is short-circuited
		// to a synthetic module whose default export is the entrypoint path.
		// `src/index.ts` has no default export of its own, so a string default
		// is a reliable signal that the hooks are still in Node's hook chain.
		const result = runScriptInSubprocess<{
			config: { name: string };
			hooksInstalledAfterLoad: boolean;
			hooksInstalledAfterReRegister: boolean;
			hooksInstalledAfterRelease: boolean;
			plainImportWorks: boolean;
		}>(`
			import { loadConfig, registerConfigHooks } from ${JSON.stringify(SOURCE_ENTRY)};
			${CF_WORKER_PROBE}

			const { exports } = await loadConfig("./cloudflare.config.ts");
			const hooksInstalledAfterLoad = await hooksInstalled();

			// A fresh registration must install the hooks again rather than
			// hand back a stale, already-deregistered handle.
			const release = registerConfigHooks();
			const hooksInstalledAfterReRegister = await hooksInstalled();
			release();
			// Releasing twice must not double-decrement the reference count.
			release();
			const hooksInstalledAfterRelease = await hooksInstalled();

			const { value } = await import("./plain.ts");

			process.stdout.write(JSON.stringify({
				config: exports.default,
				hooksInstalledAfterLoad,
				hooksInstalledAfterReRegister,
				hooksInstalledAfterRelease,
				plainImportWorks: value === "plain",
			}));
		`);

		expect(result.config.name).toBe("w");
		expect(result.hooksInstalledAfterLoad).toBe(false);
		expect(result.hooksInstalledAfterReRegister).toBe(true);
		expect(result.hooksInstalledAfterRelease).toBe(false);
		expect(result.plainImportWorks).toBe(true);
	});

	it("keeps the hooks installed for overlapping loads and releases them exactly once", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": `// not executed`,
			// The dynamic `cf-worker` import runs after a tick, so it resolves
			// while the other (faster) `loadConfig` call has already finished.
			// If the hooks were released per-call rather than reference
			// counted, this resolution would fail.
			"slow.config.ts": `
				await new Promise((resolve) => setTimeout(resolve, 100));
				const entrypoint = await import("./src/index.ts", { with: { type: "cf-worker" } });
				export default { name: "slow", entrypoint: entrypoint.default };
			`,
			"fast.config.ts": `export default { name: "fast" };`,
		});

		const result = runScriptInSubprocess<{
			slow: { name: string; entrypoint: string };
			fast: { name: string };
			hooksInstalledAfterBoth: boolean;
		}>(`
			import { loadConfig } from ${JSON.stringify(SOURCE_ENTRY)};
			${CF_WORKER_PROBE}

			const [slow, fast] = await Promise.all([
				loadConfig("./slow.config.ts"),
				loadConfig("./fast.config.ts"),
			]);

			process.stdout.write(JSON.stringify({
				slow: slow.exports.default,
				fast: fast.exports.default,
				hooksInstalledAfterBoth: await hooksInstalled(),
			}));
		`);

		expect(result.fast.name).toBe("fast");
		expect(result.slow.name).toBe("slow");
		expect(result.slow.entrypoint).toBe(path.resolve("src/index.ts"));
		expect(result.hooksInstalledAfterBoth).toBe(false);
	});

	it("releases the hooks when the config throws", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `throw new Error("boom");`,
			"src/index.ts": `// not executed`,
		});

		const result = runScriptInSubprocess<{
			loadFailed: boolean;
			hooksInstalledAfterFailure: boolean;
		}>(`
			import { loadConfig } from ${JSON.stringify(SOURCE_ENTRY)};
			${CF_WORKER_PROBE}

			let loadFailed = false;
			try {
				await loadConfig("./cloudflare.config.ts");
			} catch {
				loadFailed = true;
			}

			process.stdout.write(JSON.stringify({
				loadFailed,
				hooksInstalledAfterFailure: await hooksInstalled(),
			}));
		`);

		expect(result.loadFailed).toBe(true);
		expect(result.hooksInstalledAfterFailure).toBe(false);
	});
});
