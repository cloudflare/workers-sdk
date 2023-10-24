import { frameworkCliMap } from "../src/frameworks/package.json";

let targetFramework = undefined;

const envCliToTest = process.env.FRAMEWORK_CLI_TO_TEST;

if (envCliToTest) {
	for (const [framework, cli] of Object.entries(frameworkCliMap)) {
		if (cli === envCliToTest) {
			targetFramework = framework;
		}
	}
	if (!targetFramework) {
		throw new Error(
			`Specified cli doesn't exist in framework map: ${envCliToTest}`
		);
	}
}

/**
 * In case the e2e run is supposed to only test a single framework
 * the framework's name is set as the value of this variable, for standard
 * runs this variable's value is `undefined`
 */
export const frameworkToTest = targetFramework;
