import { execSync } from "child_process";
import { getFrameworksTests } from "../../e2e/tests/frameworks/test-config";
import { matrix } from "./test-matrix";

async function main() {
	const failed: string[] = [];

	for (const { isExperimentalMode, testPm } of matrix) {
		const description = `${testPm.name}@${testPm.version}${isExperimentalMode ? " (experimental)" : ""}`;
		try {
			// Test the CLI features
			console.log(`::group::Testing CLI: ${description}`);
			execTests("cli", isExperimentalMode, testPm, {});
			console.log("::endgroup::");

			// Test the Workers templates
			console.log(`::group::Testing Workers: ${description}`);
			execTests("workers", isExperimentalMode, testPm, {});
			console.log("::endgroup::");

			// Test the Frameworks templates
			const frameworkGroups = getFrameworksGroups(isExperimentalMode);
			for (const frameworkGroup of frameworkGroups) {
				console.log(
					`::group::Testing Frameworks: ${description} - ${frameworkGroup}`,
				);
				execTests("frameworks", isExperimentalMode, testPm, {
					E2E_FRAMEWORK_TEST_FILTER: frameworkGroup,
				});
				console.log("::endgroup::");
			}
		} catch (e) {
			if (e instanceof Error && "signal" in e && e.signal === "SIGINT") {
				break;
			}
			console.error("Failed, moving on");
			failed.push(description);
		}
	}

	if (failed.length > 0) {
		throw new Error(
			"At least one task failed:" + failed.map((file) => `\n - ${file}`),
		);
	}
}

/** Runs the tests for a given testGroup and other options */
function execTests(
	testGroup: "cli" | "workers" | "frameworks",
	experimental: boolean,
	testPm: { name: string; version: string },
	extraEnv: Record<string, string>,
) {
	execSync(
		`pnpm turbo test:e2e --log-order=stream --output-logs=new-only --summarize --filter=create-cloudflare -- ${testGroup}`,
		{
			stdio: "inherit",
			env: {
				...process.env,
				E2E_EXPERIMENTAL: `${experimental}`,
				E2E_TEST_PM: testPm.name,
				E2E_TEST_PM_VERSION: testPm.version,
				...extraEnv,
			},
		},
	);
}

/**
 * Gets the list of framework names (minus the variant) from the framework tests.
 */
function getFrameworksGroups(isExperimentalMode: boolean) {
	const frameworkTests = getFrameworksTests({ isExperimentalMode });
	return Array.from(
		new Set(frameworkTests.map((testConfig) => testConfig.name.split(":")[0])),
	);
}

main().catch((error) => {
	console.error("Error during tests:", error);
	process.exit(1);
});
