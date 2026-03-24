import { existsSync } from "node:fs";
import { join } from "node:path";
import { FALLBACK_COMPAT_DATE } from "helpers/compatDate";
import { readJSON, readToml } from "helpers/files";
import { beforeAll, describe } from "vitest";
import { deleteWorker } from "../../../scripts/common";
import {
	isWindows,
	TEST_TIMEOUT,
	workerTemplateToTest,
} from "../../helpers/constants";
import { debuglog } from "../../helpers/debuglog";
import { test } from "../../helpers/index";
import { recreateLogFolder } from "../../helpers/log-stream";
import {
	runC3ForWorkerTest,
	verifyDeployment,
	verifyLocalDev,
	verifyTestScript,
} from "../../helpers/workers-helpers";
import { getWorkerTests } from "./test-config";
import type { RunnerTestSuite } from "vitest";

const workerTests = getWorkerTests();

describe
	.skipIf(workerTests.length === 0 || isWindows)
	.concurrent(`E2E: Workers templates`, () => {
		// eslint-disable-next-line no-empty-pattern
		beforeAll(({}, ctx) => {
			recreateLogFolder(ctx as RunnerTestSuite);

			if (workerTemplateToTest) {
				debuglog("Running worker tests with filter:", workerTemplateToTest);
				workerTests.forEach((testConfig) => {
					debuglog(` - ${testConfig.name ?? testConfig.template}`);
				});
			}
		});

		workerTests.forEach((testConfig) => {
			const name = testConfig.name ?? testConfig.template;
			test(
				name,
				{ retry: 1, timeout: testConfig.timeout || TEST_TIMEOUT },
				async ({ expect, project, logStream }) => {
					try {
						const deployedUrl = await runC3ForWorkerTest(
							testConfig,
							project.path,
							logStream
						);

						// Relevant project files should have been created
						expect(project.path).toExist();

						const pkgJsonPath = join(project.path, "package.json");
						expect(pkgJsonPath).toExist();

						const wranglerPath = join(project.path, "node_modules/wrangler");
						expect(wranglerPath).toExist();

						const tomlPath = join(project.path, "wrangler.toml");
						const jsoncPath = join(project.path, "wrangler.jsonc");

						if (existsSync(jsoncPath)) {
							const config = readJSON(jsoncPath) as {
								main?: string;
								compatibility_date?: string;
							};
							if (config.main) {
								expect(join(project.path, config.main)).toExist();
							}
							// Verify the compatibility_date was resolved from the locally
							// installed wrangler package and it isn't the hardcoded fallback.
							expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
							expect(config.compatibility_date).not.toEqual(
								FALLBACK_COMPAT_DATE
							);
						} else if (existsSync(tomlPath)) {
							const config = readToml(tomlPath) as {
								main?: string;
								compatibility_date?: string;
							};
							if (config.main) {
								expect(join(project.path, config.main)).toExist();
							}
							// Verify the compatibility_date was resolved from the locally
							// installed wrangler package and it isn't the hardcoded fallback.
							expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
							expect(config.compatibility_date).not.toEqual(
								FALLBACK_COMPAT_DATE
							);
						} else {
							expect.fail(
								`Expected at least one of "${jsoncPath}" or "${tomlPath}" to exist.`
							);
						}

						const { verifyDeploy, verifyTest } = testConfig;
						if (verifyDeploy) {
							if (deployedUrl) {
								await verifyDeployment(deployedUrl, verifyDeploy);
							} else {
								await verifyLocalDev(testConfig, project.path, logStream);
							}
						}

						if (verifyTest) {
							await verifyTestScript(project.path, logStream);
						}
					} finally {
						await deleteWorker(project.name);
					}
				}
			);
		});
	});
