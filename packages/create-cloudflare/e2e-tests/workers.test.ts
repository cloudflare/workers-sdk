import { existsSync, rmSync, mkdtempSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { runC3 } from "./helpers";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

describe("E2E: Workers templates", () => {
	let projectPath: string;

	beforeEach(() => {
		// Use realpath because the temporary path can point to a symlink rather than the actual path.
		projectPath = realpathSync(mkdtempSync(join(tmpdir(), "c3-tests")));
	});

	afterEach(() => {
		if (existsSync(projectPath)) {
			rmSync(projectPath, { recursive: true });
		}
	});

	const runCli = async (template: string) => {
		const argv = [
			projectPath,
			"--type",
			template,
			"--no-ts",
			"--no-deploy",
			"--no-git",
			"--wrangler-defaults",
		];

		await runC3({ argv });

		// Relevant project files should have been created
		expect(projectPath).toExist();

		const pkgJsonPath = join(projectPath, "package.json");
		expect(pkgJsonPath).toExist();

		const wranglerPath = join(projectPath, "node_modules/wrangler");
		expect(wranglerPath).toExist();
	};

	test.each(["hello-world", "common", "chatgptPlugin", "queues", "scheduled"])(
		"%s",
		async (name) => {
			await runCli(name);
		}
	);
});
