import { join } from "path";
import { readToml } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { beforeAll, describe, expect } from "vitest";
import { deleteWorker } from "../scripts/common";
import { getFrameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	kill,
	recreateLogFolder,
	runC3,
	spawnWithLogging,
	test,
} from "./helpers";
import type { RunnerConfig } from "./helpers";
import type { Writable } from "stream";

const TEST_TIMEOUT = 1000 * 60 * 5;
const NO_DEPLOY = process.env.E2E_NO_DEPLOY ?? true;
const { name: pm } = detectPackageManager();

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
				verifyPreview: {
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
				verifyPreview: {
					route: "/",
					expectedText: "Try making requests to:",
				},
			},
			{
				template: "queues",
				variants: ["TypeScript", "JavaScript"],
				// Skipped for now, since C3 does not yet support resource creation
				verifyDeploy: null,
				verifyPreview: null,
			},
			{
				template: "scheduled",
				variants: ["TypeScript", "JavaScript"],
				// Skipped for now, since it's not possible to test scheduled events on deployed Workers
				verifyDeploy: null,
				verifyPreview: null,
			},
			{
				template: "openapi",
				variants: [],
				verifyDeploy: {
					route: "/",
					expectedText: "SwaggerUI",
				},
				verifyPreview: {
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
			.flatMap<WorkerTestConfig>((testConfig) =>
				testConfig.variants.length > 0
					? testConfig.variants.map((variant) => {
							return {
								...testConfig,
								name: `${testConfig.name ?? testConfig.template}-${variant.toLowerCase()}`,
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
					: [testConfig],
			)
			.forEach((testConfig) => {
				const name = testConfig.name ?? testConfig.template;
				test({ experimental })(
					name,
					async ({ project, logStream }) => {
						try {
							const deployedUrl = await runCli(
								testConfig,
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

							const { verifyDeploy } = testConfig;
							if (verifyDeploy) {
								if (deployedUrl) {
									await verifyDeployment(deployedUrl, verifyDeploy);
								} else {
									await verifyLocalDev(testConfig, project.path, logStream);
								}
							}
						} finally {
							await deleteWorker(project.name);
						}
					},
					{ retry: 1, timeout: testConfig.timeout || TEST_TIMEOUT },
				);
			});
	});

const runCli = async (
	{ argv, promptHandlers, template }: WorkerTestConfig,
	projectPath: string,
	logStream: Writable,
) => {
	const args = [
		projectPath,
		"--type",
		template,
		"--no-open",
		"--no-git",
		NO_DEPLOY ? "--no-deploy" : "--deploy",
		...(argv ?? []),
	];

	const { output } = await runC3(args, promptHandlers, logStream);
	if (NO_DEPLOY) {
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
	verifyDeploy: {
		route: string;
		expectedText: string;
	},
) => {
	await retry({ times: 5 }, async () => {
		await sleep(1000);
		const res = await fetch(deploymentUrl + verifyDeploy.route);
		const body = await res.text();
		if (!body.includes(verifyDeploy.expectedText)) {
			throw new Error(
				`(Deployed page (${deploymentUrl}) didn't contain expected string: "${verifyDeploy.expectedText}" instead got ${body}`,
			);
		}
	});
};

const verifyLocalDev = async (
	{ verifyDeploy }: WorkerTestConfig,
	projectPath: string,
	logStream: Writable,
) => {
	if (verifyDeploy === null) {
		return;
	}

	// Run the dev-server on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const proc = spawnWithLogging(
		[
			pm,
			"run",
			"dev",
			...(pm === "npm" ? ["--"] : []),
			"--port",
			`${TEST_PORT}`,
		],
		{
			cwd: projectPath,
			env: {
				VITEST: undefined,
			},
		},
		logStream,
	);

	try {
		// Wait for the dev-server to be ready
		await retry(
			{ times: 20, sleepMs: 5000 },
			async () =>
				await fetch(`http://127.0.0.1:${TEST_PORT}${verifyDeploy.route}`),
		);

		// Make a request to the specified test route
		const res = await fetch(
			`http://127.0.0.1:${TEST_PORT}${verifyDeploy.route}`,
		);
		expect(await res.text()).toContain(verifyDeploy.expectedText);
	} finally {
		// Kill the process gracefully so ports can be cleaned up
		await kill(proc);
		// Wait for a second to allow process to exit cleanly. Otherwise, the port might
		// end up camped and cause future runs to fail
		await sleep(1000);
	}
};
