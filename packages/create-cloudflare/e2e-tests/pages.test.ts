import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execa } from "execa";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { describe, expect, test, afterEach, beforeEach } from "vitest";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

describe("E2E", () => {
	let dummyPath: string;

	const removeDummyFolder = () => {
		rmSync(dummyPath, { recursive: true, force: true });
	};

	beforeEach(() => {
		dummyPath = join(tmpdir(), "tmp");
		removeDummyFolder();
		mkdirSync(dummyPath);
	});

	afterEach(() => {
		removeDummyFolder();
	});

	const runCli = async (framework: string) => {
		const projectPath = join(dummyPath, "test");
		const argv = [
			projectPath,
			"--type",
			"webFramework",
			"--framework",
			framework,
			"--no-deploy",
		];

		const result = await execa("node", ["./dist/cli.js", ...argv], {
			stderr: process.stderr,
		});
		// For debugging purposes, uncomment the following to see the exact
		// command the test uses. You can then run this via the command line.
		// console.log("COMMAND: ", `node ${["./dist/cli.js", ...argv].join(" ")}`);

		const { exitCode } = result;

		// Some baseline assertions for each framework
		expect(exitCode).toBe(0);

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

		return {
			result,
			projectPath,
		};
	};

	test("Astro", async () => {
		await runCli("astro");
	});

	test("Hono", async () => {
		await runCli("hono");
	});

	test("Next.js", async () => {
		await runCli("next");
	});

	test("Nuxt", async () => {
		await runCli("nuxt");
	});

	// Not possible atm since `npx qwik add cloudflare-pages`
	// requires interactive confirmation
	// test("Qwik", async () => {
	//   await runCli("next", flags);
	// });

	test("React", async () => {
		await runCli("react");
	});

	test("Remix", async () => {
		await runCli("remix");
	});

	// Not possible atm since template selection is interactive only
	// test("Solid", async () => {
	//   const flags = ["--no-deploy"];
	//   await runCli("solid", flags);
	// });

	// Not possible atm since everything is interactive only
	// test("Svelte", async () => {
	//   const flags = ["--no-deploy"];
	//   await runCli("svelte", flags);
	// });

	test("Vue", async () => {
		await runCli("vue");
	});
});
