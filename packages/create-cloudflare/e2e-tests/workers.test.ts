import { join } from "path";
import { readToml } from "helpers/files";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { beforeAll, describe, expect } from "vitest";
import { deleteWorker } from "../scripts/common";
import { getFrameworkToTest } from "./frameworkToTest";
import { isQuarantineMode, recreateLogFolder, runC3, test } from "./helpers";
import type { RunnerConfig } from "./helpers";
import type { Writable } from "stream";

const TEST_TIMEOUT = 1000 * 60 * 5;

type WorkerTestConfig = RunnerConfig & {
	name?: string;
	template: string;
	variants: string[];
};

function getWorkerTests(opts: { experimental: boolean }): WorkerTestConfig[] {
	if (opts.experimental) {
		return [];
	} else {
		return [
			{
				template: "hello-world",
				variants: ["TypeScript", "JavaScript", "Python"],
				verifyDeploy: {
					route: "/",
					expectedText: "Hello World!",
				},
			},
			{
				template: "common",
				variants: ["TypeScript", "JavaScript"],
				verifyDeploy: {
					route: "/",
					expectedText: "Try making requests to:",
				},
			},
			{
				template: "queues",
				variants: ["TypeScript", "JavaScript"],
				// Skipped for now, since C3 does not yet support resource creation
			},
			{
				template: "scheduled",
				variants: ["TypeScript", "JavaScript"],
				// Skipped for now, since it's not possible to test scheduled events on deployed Workers
			},
			{
				template: "openapi",
				variants: [],
				verifyDeploy: {
					route: "/",
					expectedText: "SwaggerUI",
				},
			},
		];
	}
}

const experimental = Boolean(process.env.E2E_EXPERIMENTAL);
const workerTests = getWorkerTests({ experimental });

describe
	.skipIf(
		experimental || // skip until we add tests for experimental workers templates
			getFrameworkToTest({ experimental }) ||
			isQuarantineMode() ||
			process.platform === "win32",
	)
	.concurrent(`E2E: Workers templates`, () => {
		beforeAll((ctx) => {
			recreateLogFolder({ experimental }, ctx);
		});

		workerTests
			.flatMap<WorkerTestConfig>((template) =>
				template.variants.length > 0
					? template.variants.map((variant) => {
							return {
								...template,
								name: `${template.name ?? template.template}-${variant.toLowerCase()}`,
								promptHandlers: [
									{
										matcher: /Which language do you want to use\?/,
										input: {
											type: "select",
											target: variant,
										},
									},
								],
							};
						})
					: [template],
			)
			.forEach((template) => {
				const name = template.name ?? template.template;
				test({ experimental })(
					name,
					async ({ project, logStream }) => {
						try {
							const deployedUrl = await runCli(
								template,
								project.path,
								logStream,
							);

							// Relevant project files should have been created
							expect(project.path).toExist();

							const gitignorePath = join(project.path, ".gitignore");
							expect(gitignorePath).toExist();

							const pkgJsonPath = join(project.path, "package.json");
							expect(pkgJsonPath).toExist();

							const wranglerPath = join(project.path, "node_modules/wrangler");
							expect(wranglerPath).toExist();

							const tomlPath = join(project.path, "wrangler.toml");
							expect(tomlPath).toExist();

							const config = readToml(tomlPath) as { main: string };
							expect(join(project.path, config.main)).toExist();

							const { verifyDeploy } = template;
							if (verifyDeploy && deployedUrl) {
								await verifyDeployment(deployedUrl, verifyDeploy.expectedText);
							}
						} finally {
							await deleteWorker(project.name);
						}
					},
					{ retry: 1, timeout: template.timeout || TEST_TIMEOUT },
				);
			});
	});

const runCli = async (
	template: WorkerTestConfig,
	projectPath: string,
	logStream: Writable,
) => {
	const { argv, promptHandlers, verifyDeploy } = template;

	const args = [
		projectPath,
		"--type",
		template.template,
		"--no-open",
		"--no-git",
		verifyDeploy ? "--deploy" : "--no-deploy",
		...(argv ?? []),
	];

	const { output } = await runC3(args, promptHandlers, logStream);

	if (!verifyDeploy) {
		return null;
	}

	// Verify deployment
	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+?\.(workers)\.dev)/;

	const match = output.replaceAll("\n", "").match(deployedUrlRe);
	if (!match || !match[1]) {
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return;
	}

	return match[1];
};

const verifyDeployment = async (
	deploymentUrl: string,
	expectedString: string,
) => {
	await retry({ times: 5 }, async () => {
		await sleep(1000);
		const res = await fetch(deploymentUrl);
		const body = await res.text();
		if (!body.includes(expectedString)) {
			throw new Error(
				`(Deployed page (${deploymentUrl}) didn't contain expected string: "${expectedString}"`,
			);
		}
	});
};
