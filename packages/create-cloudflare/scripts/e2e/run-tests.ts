import { execSync } from "child_process";
import {
	isExperimental,
	testPackageManager,
	testPackageManagerVersion,
} from "../../e2e/helpers/constants";
import { getFrameworksTests } from "../../e2e/tests/frameworks/test-config";

async function main() {
	const failed: string[] = [];

	const description = `${testPackageManager}@${testPackageManagerVersion}${isExperimental ? " (experimental)" : ""}`;
	try {
		// Test the CLI features
		console.log(`::group::Testing CLI: ${description}`);
		execTests("cli");
		console.log("::endgroup::");

		// Test the Workers templates
		console.log(`::group::Testing Workers: ${description}`);
		execTests("workers");
		console.log("::endgroup::");

		// Test the Frameworks templates
		const frameworkGroups = getFrameworksGroups();
		for (const frameworkGroup of frameworkGroups) {
			console.log(
				`::group::Testing Frameworks: ${description} - ${frameworkGroup}`,
			);
			execTests("frameworks", {
				E2E_FRAMEWORK_TEST_FILTER: frameworkGroup,
			});
			console.log("::endgroup::");
		}
	} catch (e) {
		if (e instanceof Error && "signal" in e && e.signal === "SIGINT") {
			return;
		}
		console.error("Failed, moving on");
		failed.push(description);
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
	extraEnv: Record<string, string> = {},
) {
	execSync(
		`pnpm turbo test:e2e --log-order=stream --output-logs=new-only --summarize --filter=create-cloudflare -- ${testGroup}`,
		{
			stdio: "inherit",
			env: {
				...process.env,
				E2E_EXPERIMENTAL: `${isExperimental}`,
				E2E_TEST_PM: testPackageManager,
				E2E_TEST_PM_VERSION: testPackageManagerVersion,
				...extraEnv,
			},
		},
	);
}

/**
 * Gets the list of framework names (minus the variant) from the framework tests.
 */
function getFrameworksGroups() {
	const frameworkTests = getFrameworksTests();
	return Array.from(
		new Set(frameworkTests.map((testConfig) => testConfig.name.split(":")[0])),
	);
}

main().catch((error) => {
	console.error("Error during tests:", error);
	process.exit(1);
});
