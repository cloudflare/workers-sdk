import { existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { keys, runC3 } from "./helpers";
import type { RunnerConfig } from "./helpers";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

describe("E2E", () => {
	let projectPath: string;

	beforeEach(() => {
		projectPath = join(tmpdir(), "c3-test-pages");
		rmSync(projectPath, { recursive: true, force: true });
	});

	afterEach(() => {
		if (existsSync(projectPath)) {
			rmSync(projectPath, { recursive: true });
		}
	});

	const runCli = async (
		framework: string,
		{ argv = [], promptHandlers = [] }: RunnerConfig
	) => {
		const args = [
			projectPath,
			"--type",
			"webFramework",
			"--framework",
			framework,
			"--no-deploy",
		];

		if (argv.length > 0) {
			args.push(...args);
		} else {
			args.push("--no-git");
		}

		// For debugging purposes, uncomment the following to see the exact
		// command the test uses. You can then run this via the command line.
		// console.log("COMMAND: ", `node ${["./dist/cli.js", ...argv].join(" ")}`);

		await runC3({ argv: args, promptHandlers });

		// Relevant project files should have been created
		expect(projectPath).toExist();

		const pkgJsonPath = join(projectPath, "package.json");
		expect(pkgJsonPath).toExist();

		const wranglerPath = join(projectPath, "node_modules/wrangler");
		expect(wranglerPath).toExist();

		// Verify package scripts
		const frameworkConfig = FrameworkMap[framework];
		const pkgJson = readJSON(pkgJsonPath);
		Object.entries(frameworkConfig.packageScripts).forEach(([target, cmd]) => {
			expect(pkgJson.scripts[target]).toEqual(cmd);
		});
	};

	test.each(["astro", "hono", "next", "nuxt", "react", "remix", "vue"])(
		"%s",
		async (name) => {
			await runCli(name, {});
		}
	);

	test("qwik", async () => {
		await runCli("qwik", {
			promptHandlers: [
				{
					matcher: /Yes looks good, finish update/,
					input: [keys.enter],
				},
			],
		});
	});

	test("solid", async () => {
		await runCli("solid", {
			promptHandlers: [
				{
					matcher: /Which template do you want to use/,
					input: [keys.enter],
				},
				{
					matcher: /Server Side Rendering/,
					input: [keys.enter],
				},
				{
					matcher: /Use TypeScript/,
					input: [keys.enter],
				},
			],
		});
	});

	test("svelte", async () => {
		await runCli("svelte", {
			promptHandlers: [
				{
					matcher: /Which Svelte app template/,
					input: [keys.enter],
				},
				{
					matcher: /Add type checking with TypeScript/,
					input: [keys.down, keys.enter],
				},
				{
					matcher: /Select additional options/,
					input: [keys.enter],
				},
			],
		});
	});

	// This test blows up in CI due to Github providing an unusual git user email address.
	// E.g.
	// ```
	// fatal: empty ident name (for <runner@fv-az176-734.urr04s1gdzguhowldvrowxwctd.dx.
	// internal.cloudapp.net>) not allowed
	// ```
	test.skip("Hono (wrangler defaults)", async () => {
		await runCli("hono", { argv: ["--wrangler-defaults"] });

		// verify that wrangler-defaults defaults to `true` for using git
		expect(join(projectPath, ".git")).toExist();
	});
});
