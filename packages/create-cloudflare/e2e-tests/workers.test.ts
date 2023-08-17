import { join } from "path";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { runC3, testProjectDir } from "./helpers";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
*/

describe("E2E: Workers templates", () => {
	const { getPath, clean } = testProjectDir("workers");

	beforeEach((ctx) => {
		const template = ctx.meta.name;
		clean(template);
	});

	afterEach((ctx) => {
		const template = ctx.meta.name;
		clean(template);
	});

	const runCli = async (template: string) => {
		const projectPath = getPath(template);

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
