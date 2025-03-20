import { keys, LONG_TIMEOUT } from "../helpers";

export default function getFrameworkTestConfigExperimental() {
	return {
		qwik: {
			promptHandlers: [
				{
					matcher: /Yes looks good, finish update/,
					input: [keys.enter],
				},
			],
			flags: [],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			unsupportedPms: ["yarn"],
			verifyDeploy: {
				route: "/",
				expectedText: "Welcome to Qwik",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Welcome to Qwik",
			},
			verifyBuildCfTypes: {
				outputFile: "worker-configuration.d.ts",
				envInterfaceName: "Env",
			},
		},
		next: {
			testCommitMessage: true,
			flags: [
				"--ts",
				"--tailwind",
				"--eslint",
				"--app",
				"--import-alias",
				"@/*",
				"--src-dir",
			],
			verifyBuildCfTypes: {
				outputFile: "cloudflare-env.d.ts",
				envInterfaceName: "CloudflareEnv",
			},
			verifyPreview: {
				route: "/test",
				expectedText: "Create Next App",
			},
			verifyDeploy: {
				route: "/",
				expectedText: "Create Next App",
			},
			// see https://github.com/cloudflare/next-on-pages/blob/main/packages/next-on-pages/docs/supported.md#operating-systems
			unsupportedOSs: ["win32"],
			unsupportedPms: [
				// bun and yarn are failing in CI
				"bun",
				"yarn",
			],
		},
		solid: {
			promptHandlers: [
				{
					matcher: /Which template would you like to use/,
					input: [keys.enter],
				},
				{
					matcher: /Use Typescript/,
					input: [keys.enter],
				},
			],
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			unsupportedPms: ["npm", "yarn"],
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello world",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Hello world",
			},
		},
	};
}
