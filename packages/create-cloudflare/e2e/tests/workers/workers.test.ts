import "../../helpers/to-exist";
import { existsSync } from "fs";
import { join } from "path";
import { readJSON, readToml } from "helpers/files";
import { beforeAll, describe, expect } from "vitest";
import { deleteWorker } from "../../../scripts/common";
import { E2E_WORKER_TEST_FILTER, TEST_TIMEOUT } from "../../helpers/constants";
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

const workerTests = getWorkerTests();

describe
	.skipIf(
		workerTests.length === 0,
		// TODO: is this skip necessary?: isWindows
	)
	.concurrent(`E2E: Workers templates`, () => {
		beforeAll((ctx) => {
			recreateLogFolder(ctx);

			if (E2E_WORKER_TEST_FILTER) {
				debuglog("Running worker tests with filter:", E2E_WORKER_TEST_FILTER);
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
				async ({ project, logStream }) => {
					try {
						const deployedUrl = await runC3ForWorkerTest(
							testConfig,
							project.path,
							logStream,
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
							const config = readJSON(jsoncPath) as { main?: string };
							if (config.main) {
								expect(join(project.path, config.main)).toExist();
							}
						} else if (existsSync(tomlPath)) {
							const config = readToml(tomlPath) as { main?: string };
							if (config.main) {
								expect(join(project.path, config.main)).toExist();
							}
						} else {
							expect.fail(
								`Expected at least one of "${jsoncPath}" or "${tomlPath}" to exist.`,
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
				},
			);
		});
	});
