import { existsSync, rmSync, mkdtempSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execa } from "execa";
import { describe, expect, test, afterEach, beforeEach } from "vitest";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

describe("E2E: Workers templates", () => {
	let dummyPath: string;

	beforeEach(() => {
		// Use realpath because the temporary path can point to a symlink rather than the actual path.
		dummyPath = realpathSync(mkdtempSync(join(tmpdir(), "c3-tests")));
	});

	afterEach(() => {
		if (existsSync(dummyPath)) {
			rmSync(dummyPath, { recursive: true });
		}
	});

	const runCli = async (template: string) => {
		const projectPath = join(dummyPath, "test");
		const argv = [
			projectPath,
			"--type",
			template,
			"--no-ts",
			"--no-deploy",
			"--no-git",
			"--wrangler-defaults",
		];

		const result = await execa("node", ["./dist/cli.js", ...argv], {
			stderr: process.stderr,
		});
		// For debugging purposes, uncomment the following to see the exact
		// command the test uses. You can then run this via the command line.
		// console.log("COMMAND: ", `node ${["./dist/cli.js", ...argv].join(" ")}`);

		const { exitCode } = result;

		// Some baseline assertions for each template
		expect(exitCode).toBe(0);

		// Relevant project files should have been created
		expect(projectPath).toExist();

		const pkgJsonPath = join(projectPath, "package.json");
		expect(pkgJsonPath).toExist();

		const wranglerPath = join(projectPath, "node_modules/wrangler");
		expect(wranglerPath).toExist();

		return {
			result,
			projectPath,
		};
	};

	test("hello-world", async () => {
		await runCli("hello-world");
	});

	test("common", async () => {
		await runCli("common");
	});

	test("chatgptPlugin", async () => {
		await runCli("chatgptPlugin");
	});

	test("queues", async () => {
		await runCli("queues");
	});

	test("scheduled", async () => {
		await runCli("scheduled");
	});
});
