import { keys, LONG_TIMEOUT } from "../helpers";

export default function getFrameworkTestConfigExperimental() {
	return {
		angular: {
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			unsupportedOSs: ["win32"],
			unsupportedPms: ["bun"],
			verifyDeploy: {
				route: "/",
				expectedText: "Congratulations! Your app is running.",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Congratulations! Your app is running.",
			},
			flags: ["--style", "sass"],
		},
		gatsby: {
			unsupportedPms: ["bun", "pnpm"],
			promptHandlers: [
				{
					matcher: /Would you like to use a template\?/,
					input: ["n"],
				},
			],
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			verifyDeploy: {
				route: "/",
				expectedText: "Gatsby!",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Gatsby!",
			},
		},
		hono: {
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/message",
				expectedText: "Hello Hono!",
			},
			verifyPreview: {
				route: "/message",
				expectedText: "Hello Hono!",
			},
			promptHandlers: [
				{
					matcher: /Do you want to install project dependencies\?/,
					input: [keys.enter],
				},
			],
		},
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
		remix: {
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			unsupportedPms: ["yarn"],
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Welcome to Remix",
			},
			verifyPreview: {
				route: "/test",
				expectedText: "C3_TEST",
			},
			verifyBuildCfTypes: {
				outputFile: "worker-configuration.d.ts",
				envInterfaceName: "Env",
			},
			flags: ["--typescript", "--no-install", "--no-git-init"],
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
		nuxt: {
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			unsupportedPms: ["yarn"], // Currently nitro requires youch which expects Node 20+, and yarn will fail hard since we run on Node 18
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Welcome to Nuxt!",
			},
			verifyPreview: {
				route: "/test",
				expectedText: "C3_TEST",
			},
			verifyBuildCfTypes: {
				outputFile: "worker-configuration.d.ts",
				envInterfaceName: "Env",
			},
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
		svelte: {
			promptHandlers: [
				{
					matcher: /Which template would you like/,
					input: [keys.enter],
				},
				{
					matcher: /Add type checking with Typescript/,
					input: [keys.down, keys.enter],
				},
				{
					matcher: /What would you like to add to your project/,
					input: [keys.enter],
				},
				{
					matcher:
						/Which package manager do you want to install dependencies with/,
					input: [keys.enter],
				},
			],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			unsupportedPms: ["npm"],
			verifyDeploy: {
				route: "/",
				expectedText: "SvelteKit app",
			},
			verifyPreview: {
				route: "/test",
				expectedText: "C3_TEST",
			},
		},
		vue: {
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Vite App",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Vite App",
			},
			flags: ["--ts"],
		},
	};
}
