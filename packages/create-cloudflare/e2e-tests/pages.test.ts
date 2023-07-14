import { existsSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { runC3 } from "./helpers";

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
		mkdirSync(projectPath);
	});

	afterEach(() => {
		if (existsSync(projectPath)) {
			rmSync(projectPath, { recursive: true });
		}
	});

	const runCli = async (framework: string, args: string[] = []) => {
		const argv = [
			projectPath,
			"--type",
			"webFramework",
			"--framework",
			framework,
			"--no-deploy",
		];

		if (args.length > 0) {
			argv.push(...args);
		} else {
			argv.push("--no-git");
		}

		// For debugging purposes, uncomment the following to see the exact
		// command the test uses. You can then run this via the command line.
		// console.log("COMMAND: ", `node ${["./dist/cli.js", ...argv].join(" ")}`);

		await runC3({ argv });

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
			await runCli(name);
		}
	);

	test.skip.each([
		// Not possible since it requires interactive input
		"solid",
		"svelte",
		// Not possible atm since `npx qwik add cloudflare-pages`
		// requires interactive confirmation
		"qwik",
	])("%s", async (name) => {
		await runCli(name);
	});

	// This test blows up in CI due to Github providing an unusual git user email address.
	// E.g.
	// ```
	// fatal: empty ident name (for <runner@fv-az176-734.urr04s1gdzguhowldvrowxwctd.dx.
	// internal.cloudapp.net>) not allowed
	// ```
	test.skip("Hono (wrangler defaults)", async () => {
		await runCli("hono", ["--wrangler-defaults"]);

		// verify that wrangler-defaults defaults to `true` for using git
		expect(join(projectPath, ".git")).toExist();
	});
});
