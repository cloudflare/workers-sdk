import { join } from "path";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { frameworkToTest } from "./frameworkToTest";
import { isQuarantineMode, runC3, testProjectDir } from "./helpers";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
*/

// Note: skipIf(frameworkToTest) makes it so that all the worker tests are
//       skipped in case we are testing a specific framework
//       (since no worker template implements a framework application)
describe.skipIf(frameworkToTest || isQuarantineMode())(
	"E2E: Workers templates",
	() => {
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
			const projectPath = getPath(template.toLowerCase());

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

			const gitignorePath = join(projectPath, ".gitignore");
			expect(gitignorePath).toExist();

			const pkgJsonPath = join(projectPath, "package.json");
			expect(pkgJsonPath).toExist();

			const wranglerPath = join(projectPath, "node_modules/wrangler");
			expect(wranglerPath).toExist();
		};

		test.each([
			"hello-world",
			"common",
			"chatgptPlugin",
			"queues",
			"scheduled",
			"openapi",
		])("%s", async (name) => {
			await runCli(name);
		});
	}
);
