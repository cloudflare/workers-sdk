import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
// eslint-disable-next-line workers-sdk/no-vitest-import-expect -- e2e test with complex patterns
import { beforeAll, describe, expect } from "vitest";
import { deleteProject, deleteWorker } from "../../../scripts/common";
import {
	frameworkToTestFilter,
	isExperimental,
	TEST_TIMEOUT,
	testRetries,
} from "../../helpers/constants";
import { debuglog } from "../../helpers/debuglog";
import {
	addTestVarsToWranglerToml,
	getFrameworkConfig,
	runC3ForFrameworkTest,
	shouldRunTest,
	testGitCommitMessage,
	verifyCloudflareVitePluginConfigured,
	verifyDeployment,
	verifyDevScript,
	verifyPreviewScript,
	verifyTypes,
} from "../../helpers/framework-helpers";
import { test } from "../../helpers/index";
import { recreateLogFolder } from "../../helpers/log-stream";
import { getFrameworksTests } from "./test-config";

const frameworkTests = getFrameworksTests();

describe
	.skipIf(frameworkTests.length === 0)
	.concurrent(`E2E: Web frameworks`, () => {
		beforeAll((ctx) => {
			if (frameworkToTestFilter) {
				debuglog("Running framework tests with filter:", frameworkToTestFilter);
				frameworkTests.forEach((testConfig) => {
					debuglog(` - ${testConfig.name}`);
				});
			}

			recreateLogFolder(ctx);
		});

		frameworkTests.forEach((testConfig) => {
			const frameworkConfig = {
				workersTypes: "generated" as const,
				typesPath: "./worker-configuration.d.ts",
				envInterfaceName: "Env",
				...getFrameworkConfig(testConfig.name),
			};
			test.runIf(shouldRunTest(testConfig))(
				`${frameworkConfig.id} (${frameworkConfig.platform ?? "pages"})`,
				{
					retry: testRetries,
					timeout: testConfig.timeout || TEST_TIMEOUT,
				},
				async ({ logStream, project }) => {
					if (!testConfig.verifyDeploy) {
						expect(
							true,
							"A `deploy` configuration must be defined for all framework tests",
						).toBe(false);
						return;
					}

					try {
						const deploymentUrl = await runC3ForFrameworkTest(
							frameworkConfig.id,
							project.path,
							logStream,
							{
								argv: [
									...(isExperimental ? ["--experimental"] : []),
									...(testConfig.testCommitMessage ? ["--git"] : ["--no-git"]),
									...(testConfig.argv ?? []),
									...(testConfig.flags ? ["--", ...testConfig.flags] : []),
								],
								promptHandlers: testConfig.promptHandlers,
								extraEnv: testConfig.extraEnv,
							},
						);

						// Relevant project files should have been created
						expect(project.path).toExist();
						const pkgJsonPath = join(project.path, "package.json");
						expect(pkgJsonPath).toExist();

						// Wrangler should be installed
						const wranglerPath = join(project.path, "node_modules/wrangler");
						expect(wranglerPath).toExist();

						await addTestVarsToWranglerToml(project.path);

						if (testConfig.testCommitMessage) {
							await testGitCommitMessage(
								project.name,
								frameworkConfig.id,
								project.path,
							);
						}

						// Make a request to the deployed project and verify it was successful
						await verifyDeployment(
							testConfig,
							frameworkConfig.id,
							project.name,
							`${deploymentUrl}${testConfig.verifyDeploy.route}`,
							testConfig.verifyDeploy.expectedText,
						);

						// Copy over any platform specific test fixture files
						const platformFixturePath = join(
							__dirname,
							"fixtures",
							frameworkConfig.id,
							frameworkConfig.platform,
						);
						if (existsSync(platformFixturePath)) {
							await cp(platformFixturePath, project.path, {
								recursive: true,
								force: true,
							});
						} else {
							// Copy over any platform agnostic test fixture files
							const fixturePath = join(
								__dirname,
								"fixtures",
								frameworkConfig.id,
							);
							if (existsSync(fixturePath)) {
								await cp(fixturePath, project.path, {
									recursive: true,
									force: true,
								});
							}
						}

						await verifyDevScript(
							testConfig,
							frameworkConfig,
							project.path,
							logStream,
						);

						await verifyPreviewScript(
							testConfig,
							frameworkConfig,
							project.path,
							logStream,
						);

						await verifyTypes(testConfig, frameworkConfig, project.path);

						await verifyCloudflareVitePluginConfigured(
							testConfig,
							project.path,
						);
					} catch (e) {
						expect.fail(
							"Failed due to an exception while running C3. See logs for more details. Error: " +
								e,
						);
					} finally {
						// Cleanup the project in case we need to retry it
						if (frameworkConfig.platform === "workers") {
							await deleteWorker(project.name);
						} else {
							await deleteProject(project.name);
						}
					}
				},
			);
		});
	});
