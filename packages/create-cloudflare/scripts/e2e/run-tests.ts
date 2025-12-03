import { execSync } from "child_process";
import {
	isExperimental,
	testPackageManager,
	testPackageManagerVersion,
} from "../../e2e/helpers/constants";

class TestRunner {
	#failed: string[] = [];

	execTests(testFilter: "cli" | "workers" | "frameworks") {
		const description = `Testing ${testFilter}`;

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
					this.#failed.map((group) => `\n - ${group}`),
			);
		}
	}
}

function main() {
	const testRunner = new TestRunner();
	if (!process.env.E2E_TEST_FILTER || process.env.E2E_TEST_FILTER === "cli") {
		testRunner.execTests("cli");
	}
	if (
		!process.env.E2E_TEST_FILTER ||
		process.env.E2E_TEST_FILTER === "workers"
	) {
		testRunner.execTests("workers");
	}
	if (
		!process.env.E2E_TEST_FILTER ||
		process.env.E2E_TEST_FILTER === "frameworks"
	) {
		testRunner.execTests("frameworks");
	}
	testRunner.assertNoFailures();
}

main();
