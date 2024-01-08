import { join } from "path";
import { retry } from "helpers/command";
import { readToml } from "helpers/files";
import { fetch } from "undici";
import { describe, expect, test, beforeAll } from "vitest";
import { deleteWorker } from "../scripts/common";
import { frameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	recreateLogFolder,
	runC3,
	testProjectDir,
} from "./helpers";
import type { RunnerConfig } from "./helpers";
import type { Suite, TestContext } from "vitest";

const TEST_TIMEOUT = 1000 * 60 * 5;

type WorkerTestConfig = Omit<RunnerConfig, "ctx"> & {
	expectResponseToContain?: string;
	timeout?: number;
	name?: string;
	template: string;
};
describe
	.skipIf(frameworkToTest || isQuarantineMode() || process.platform === "win32")
	.concurrent(`E2E: Workers templates`, () => {
		const workerTemplates: WorkerTestConfig[] = [
			{
				expectResponseToContain: "Hello World!",
				template: "hello-world",
			},
			{
				template: "common",
				expectResponseToContain: "Try making requests to:",
			},
			{
				template: "chatgptPlugin",
				name: "chat-gpt-plugin",
				expectResponseToContain: "SwaggerUI",
				promptHandlers: [],
			},
			{
				template: "queues",
				// Skipped for now, since C3 does not yet support resource creation
				// expectResponseToContain:
			},
			{
				template: "scheduled",
				// Skipped for now, since it's not possible to test scheduled events on deployed Workers
				// expectResponseToContain:
			},
			{
				template: "openapi",
				expectResponseToContain: "SwaggerUI",
				promptHandlers: [],
			},
		];

		beforeAll((ctx) => {
			recreateLogFolder(ctx as Suite);
		});

		const runCli = async (
			framework: string,
			projectPath: string,
			{ ctx, argv = [], promptHandlers = [] }: RunnerConfig
		) => {
			const args = [
				projectPath,
				"--type",
				framework,
				"--deploy",
				"--no-open",
				"--no-git",
			];

			args.push(...argv);

			const { output } = await runC3({
				ctx,
				argv: args,
				promptHandlers,
				outputPrefix: `[${framework}]`,
			});

			// Relevant project files should have been created
			expect(projectPath).toExist();

			const gitignorePath = join(projectPath, ".gitignore");
			expect(gitignorePath).toExist();

			const pkgJsonPath = join(projectPath, "package.json");
			expect(pkgJsonPath).toExist();

			const wranglerPath = join(projectPath, "node_modules/wrangler");
			expect(wranglerPath).toExist();

			const tomlPath = join(projectPath, "wrangler.toml");
			expect(tomlPath).toExist();

			const config = readToml(tomlPath) as { main: string };

			expect(join(projectPath, config.main)).toExist();

			return { output };
		};

		const runCliWithDeploy = async (
			template: WorkerTestConfig,
			projectPath: string,
			ctx: TestContext
		) => {
			const { argv, overrides, promptHandlers, expectResponseToContain } =
				template;

			const { output } = await runCli(template.template, projectPath, {
				ctx,
				overrides,
				promptHandlers,
				argv: [...(argv ?? [])],
			});

			if (expectResponseToContain) {
				// Verify deployment
				const deployedUrlRe =
					/deployment is ready at: (https:\/\/.+\.(workers)\.dev)/;

				const match = output.match(deployedUrlRe);
				if (!match || !match[1]) {
					expect(false, "Couldn't find deployment url in C3 output").toBe(true);
					return;
				}

				const projectUrl = match[1];

				await retry({ times: 5 }, async () => {
					await new Promise((resolve) => setTimeout(resolve, 1000)); // wait a second
					const res = await fetch(projectUrl);
					const body = await res.text();
					if (!body.includes(expectResponseToContain)) {
						throw new Error(
							`(${template}) Deployed page (${projectUrl}) didn't contain expected string: "${expectResponseToContain}"`
						);
					}
				});
			}
		};

		workerTemplates
			.flatMap<WorkerTestConfig>((template) =>
				template.promptHandlers
					? [template]
					: [
							{
								...template,
								name: `${template.name ?? template.template}-ts`,
								promptHandlers: [
									{
										matcher: /Do you want to use TypeScript\?/,
										input: ["y"],
									},
								],
							},

							{
								...template,
								name: `${template.name ?? template.template}-js`,
								promptHandlers: [
									{
										matcher: /Do you want to use TypeScript\?/,
										input: ["n"],
									},
								],
							},
					  ]
			)
			.forEach((template) => {
				const name = template.name ?? template.template;
				test(
					name,
					async (ctx) => {
						const { getPath, getName, clean } = testProjectDir("workers");
						const projectPath = getPath(name);
						const projectName = getName(name);
						try {
							await runCliWithDeploy(template, projectPath, ctx);
						} finally {
							clean(name);
							await deleteWorker(projectName);
						}
					},
					{ retry: 1, timeout: template.timeout || TEST_TIMEOUT }
				);
			});
	});
