import { join } from "path";
import { retry } from "helpers/command";
import { readToml } from "helpers/files";
import { fetch } from "undici";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { deleteWorker } from "../scripts/common";
import { frameworkToTest } from "./frameworkToTest";
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

type WorkerTestConfig = Omit<RunnerConfig, "ctx"> & {
	expectResponseToContain?: string;
	timeout?: number;
	name?: string;
	template: string;
};

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
					async () => {
						const { getPath, getName, clean } = testProjectDir("workers");
						const projectPath = getPath(name);
						const projectName = getName(name);
						try {
							const deployedUrl = await runCli(
								template,
								projectPath,
								logStream
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

							if (deployedUrl) {
								await verifyDeployment(
									deployedUrl,
									template.expectResponseToContain as string
								);
							}
						} finally {
							clean(name);
							await deleteWorker(projectName);
						}
					},
					{ retry: 1, timeout: template.timeout || TEST_TIMEOUT }
				);
			});
	});

const runCli = async (
	template: WorkerTestConfig,
	projectPath: string,
	logStream: WriteStream
) => {
	const { argv, promptHandlers, expectResponseToContain } = template;

	const deploy = Boolean(expectResponseToContain);

	const args = [
		projectPath,
		"--type",
		template.template,
		"--no-open",
		"--no-git",
		deploy ? "--deploy" : "--no-deploy",
		...(argv ?? []),
	];

	const { output } = await runC3(args, promptHandlers, logStream);

	if (!deploy) {
		return null;
	}

	// Verify deployment
	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+\.(workers)\.dev)/;

	const match = output.match(deployedUrlRe);
	if (!match || !match[1]) {
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return;
	}

	return match[1];
};

const verifyDeployment = async (
	deploymentUrl: string,
	expectedString: string
) => {
	await retry({ times: 5 }, async () => {
		await new Promise((resolve) => setTimeout(resolve, 1000)); // wait a second
		const res = await fetch(deploymentUrl);
		const body = await res.text();
		if (!body.includes(expectedString)) {
			throw new Error(
				`(Deployed page (${deploymentUrl}) didn't contain expected string: "${expectedString}"`
			);
		}
	});
};
