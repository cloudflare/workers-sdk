import { join } from "path";
import { readToml } from "helpers/files";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { deleteWorker } from "../scripts/common";
import { getFrameworkToTest } from "./frameworkToTest";
import {
	createTestLogStream,
	isQuarantineMode,
	recreateLogFolder,
	runC3,
	testProjectDir,
} from "./helpers";
import type { RunnerConfig } from "./helpers";
import type { WriteStream } from "fs";
import type { Suite } from "vitest";

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
		getFrameworkToTest({ experimental }) ||
			isQuarantineMode() ||
			process.platform === "win32",
	)
	.concurrent(`E2E: Workers templates`, () => {
		let logStream: WriteStream;

		beforeAll((ctx) => {
			recreateLogFolder({ experimental }, ctx as Suite);
		});

		beforeEach(async (ctx) => {
			logStream = createTestLogStream({ experimental }, ctx);
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
				test(
					name,
					async () => {
						const { getPath, getName, clean } = testProjectDir("workers");
						const projectPath = getPath(name);
						const projectName = getName(name);
						try {
							const deployedUrl = await runCli(
								template,
								projectPath,
								logStream,
							);

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

							const { verifyDeploy } = template;
							if (verifyDeploy && deployedUrl) {
								await verifyDeployment(deployedUrl, verifyDeploy.expectedText);
							}
						} finally {
							clean(name);
							await deleteWorker(projectName);
						}
					},
					{ retry: 1, timeout: template.timeout || TEST_TIMEOUT },
				);
			});
	});

const runCli = async (
	template: WorkerTestConfig,
	projectPath: string,
	logStream: WriteStream,
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
