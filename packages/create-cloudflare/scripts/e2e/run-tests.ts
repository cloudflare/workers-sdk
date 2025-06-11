import { execSync } from "child_process";
import {
	isExperimental,
	testPackageManager,
	testPackageManagerVersion,
} from "../../e2e/helpers/constants";
import { getFrameworksTests } from "../../e2e/tests/frameworks/test-config";

class TestRunner {
	#failed: string[] = [];

	/** Runs the tests for a given testGroup and other options */
	execTests(
		description: string,
		testFilter: "cli" | "workers" | "frameworks",
		extraEnv: Record<string, string> = {},
	) {
		try {
			console.log(
				`::group::${description} (${testPackageManager}${testPackageManagerVersion ? `@${testPackageManagerVersion}` : ""}${isExperimental ? " / experimental" : ""})`,
			);
			execSync(
				`pnpm turbo test:e2e --log-order=stream --output-logs=new-only --summarize --filter=create-cloudflare -- ${testFilter}`,
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
			console.log("::endgroup::");
		} catch (e) {
			if (e instanceof Error && "signal" in e && e.signal === "SIGINT") {
				process.exit(1);
			}
			console.error("Failed, moving on");
			this.#failed.push(description);
		}
	}

	assertNoFailures() {
		if (this.#failed.length > 0) {
			throw new Error(
				"At least one task failed:" +
					this.#failed.map((file) => `\n - ${file}`),
			);
		}
	}
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

function main() {
	const testRunner = new TestRunner();
	testRunner.execTests(`Testing CLI`, "cli");
	testRunner.execTests(`Testing Workers`, "workers");
	testRunner.execTests(`Testing Framework`, "frameworks");
	testRunner.assertNoFailures();
}

main();
