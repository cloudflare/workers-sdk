import { join } from "path";
import { readToml } from "helpers/files";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { deleteWorker } from "../scripts/common";
import { frameworkToTest } from "./frameworkToTest";
import {
	createTestLogStream,
	isQuarantineMode,
	keys,
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

const workerTemplates: WorkerTestConfig[] = [
	{
		template: "hello-world",
		variants: ["ts", "js", "python"],
		verifyDeploy: {
			route: "/",
			expectedText: "Hello World!",
		},
	},
	{
		template: "common",
		variants: ["ts", "js"],
		verifyDeploy: {
			route: "/",
			expectedText: "Try making requests to:",
		},
	},
	{
		template: "queues",
		variants: ["ts", "js"],
		// Skipped for now, since C3 does not yet support resource creation
	},
	{
		template: "scheduled",
		variants: ["ts", "js"],
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

describe
	.skipIf(frameworkToTest || isQuarantineMode() || process.platform === "win32")
	.concurrent(`E2E: Workers templates`, () => {
		let logStream: WriteStream;

		beforeAll((ctx) => {
			recreateLogFolder(ctx as Suite);
		});

		beforeEach(async (ctx) => {
			logStream = createTestLogStream(ctx);
		});

		workerTemplates
			.flatMap<WorkerTestConfig>((template) =>
				template.variants.length > 0
					? template.variants.map((variant, index) => {
							return {
								...template,
								name: `${template.name ?? template.template}-${variant}`,
								promptHandlers: [
									{
										matcher: /Which language do you want to use\?/,
										// Assuming the variants are defined in the same order it is displayed in the prompt
										input: Array(index).fill(keys.down).concat(keys.enter),
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
		/deployment is ready at: (https:\/\/.+\.(workers)\.dev)/;

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
