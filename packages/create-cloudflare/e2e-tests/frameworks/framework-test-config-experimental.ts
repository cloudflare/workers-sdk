import { keys, LONG_TIMEOUT } from "../helpers";
import type { FrameworkTestConfig } from "../frameworks.test";

export default function getFrameworkTestConfigExperimental(): Record<
	string,
	FrameworkTestConfig
> {
	return {
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
			verifyBuildCfTypes: {
				outputFile: "worker-configuration.d.ts",
				envInterfaceName: "CloudflareBindings",
				command: "wrangler types --env-interface CloudflareBindings",
				compatFlags: [],
			},
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
				command: "wrangler types",
				compatFlags: ["nodejs_compat"],
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
				command: "wrangler types",
				compatFlags: [],
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
				command:
					"wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts",
				compatFlags: ["nodejs_compat"],
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
			verifyBuildCfTypes: {
				outputFile: "./src/worker-configuration.d.ts",
				envInterfaceName: "Env",
				command: "wrangler types",
				compatFlags: [],
			},
		},
	};
}
