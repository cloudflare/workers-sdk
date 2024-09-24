import { getFrameworkMap } from "../src/templates";

/**
 * Get the name of the framework to test or undefined if not focussing on a single framework.
 */
export function getFrameworkToTest({ experimental = false }) {
	const envCliToTest = process.env.FRAMEWORK_CLI_TO_TEST;
	if (!envCliToTest) {
		return undefined;
	}

	const frameworks = getFrameworkMap({ experimental });
	for (const [framework, { frameworkCli }] of Object.entries(frameworks)) {
		if (frameworkCli === envCliToTest) {
			return framework;
		}
	}

	throw new Error(
		`Specified cli doesn't exist in framework map: ${envCliToTest}`,
	);
}
