import { keys, LONG_TIMEOUT } from "../helpers";

// These are ordered based on speed and reliability for ease of debugging
export default function getFrameworkTestConfig(pm: string) {
	return {
		"react-router": {
			unsupportedOSs: ["win32"],
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			verifyDeploy: {
				route: "/",
				expectedText: "Hello from Cloudflare",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Hello from Cloudflare",
				previewArgs: ["--host=127.0.0.1"],
			},
			verifyBuildCfTypes: {
				outputFile: "worker-configuration.d.ts",
				envInterfaceName: "Env",
			},
			flags: ["--no-install", "--no-git-init"],
		},
		"astro:pages": {
			argv: ["--platform", "pages"],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello, Astronaut!",
			},
			verifyPreview: {
				route: "/test",
				expectedText: "C3_TEST",
			},
			verifyBuild: {
				outputDir: "./dist",
				script: "build",
				route: "/test",
				expectedText: "C3_TEST",
			},
			flags: [
				"--skip-houston",
				"--no-install",
				"--no-git",
				"--template",
				"blog",
				"--typescript",
				"strict",
			],
		},
		"astro:workers": {
			argv: ["--platform", "workers"],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello, Astronaut!",
			},
			verifyPreview: {
				route: "/test",
				expectedText: "C3_TEST",
			},
			verifyBuild: {
				outputDir: "./dist",
				script: "build",
				route: "/test",
				expectedText: "C3_TEST",
			},
			flags: [
				"--skip-houston",
				"--no-install",
				"--no-git",
				"--template",
				"blog",
				"--typescript",
				"strict",
			],
		},
		"docusaurus:pages": {
			argv: ["--platform", "pages"],
			unsupportedPms: ["bun"],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			timeout: LONG_TIMEOUT,
			verifyDeploy: {
				route: "/",
				expectedText: "Dinosaurs are cool",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Dinosaurs are cool",
			},
			flags: [`--package-manager`, pm],
			promptHandlers: [
				// {
				// 	matcher: /Which platform do you want to deploy to\?/,
				// 	input: [keys.enter],
				// },
				{
					matcher: /Which language do you want to use\?/,
					input: [keys.enter],
				},
			],
		},
		"docusaurus:workers": {
			argv: ["--platform", "workers"],
			unsupportedPms: ["bun"],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			timeout: LONG_TIMEOUT,
			verifyDeploy: {
				route: "/",
				expectedText: "Dinosaurs are cool",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Dinosaurs are cool",
			},
			flags: [`--package-manager`, pm],
			promptHandlers: [
				{
					matcher: /Which language do you want to use\?/,
					input: [keys.enter],
				},
			],
		},
		analog: {
			quarantine: true,
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
			unsupportedOSs: ["win32"],
			// The analog template works with yarn, but the build takes so long that it
			// becomes flaky in CI
			unsupportedPms: ["yarn", "bun"],
			verifyDeploy: {
				route: "/",
				expectedText: "The fullstack meta-framework for Angular!",
			},
			verifyPreview: {
				route: "/api/v1/test",
				expectedText: "C3_TEST",
			},
			verifyBuildCfTypes: {
				outputFile: "worker-configuration.d.ts",
				envInterfaceName: "Env",
			},
			verifyBuild: {
				outputDir: "./dist/analog/public",
				script: "build",
				route: "/api/v1/test",
				expectedText: "C3_TEST",
			},
			flags: ["--skipTailwind"],
		},
		"angular:pages": {
			argv: ["--platform", "pages"],
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
		"angular:workers": {
			argv: ["--platform", "workers"],
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
		"gatsby:pages": {
			argv: ["--platform", "pages"],
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
		"gatsby:workers": {
			argv: ["--platform", "workers"],
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
		"hono:pages": {
			argv: ["--platform", "pages"],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello!",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Hello!",
			},
			promptHandlers: [
				{
					matcher: /Do you want to install project dependencies\?/,
					input: [keys.enter],
				},
			],
		},
		"hono:workers": {
			argv: ["--platform", "workers"],
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
		"qwik:pages": {
			argv: ["--platform", "pages"],
			promptHandlers: [
				{
					matcher: /Yes looks good, finish update/,
					input: [keys.enter],
				},
			],
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
		"qwik:workers": {
			argv: ["--platform", "workers"],
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
		"remix:pages": {
			argv: ["--platform", "pages"],
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
			verifyBuild: {
				outputDir: "./build/client",
				script: "build",
				route: "/test",
				expectedText: "C3_TEST",
			},
			flags: ["--typescript", "--no-install", "--no-git-init"],
		},
		"remix:workers": {
			argv: ["--platform", "workers"],
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
		"next:pages": {
			argv: ["--platform", "pages"],
			timeout: LONG_TIMEOUT,
			unsupportedPms: ["pnpm"],
			promptHandlers: [
				{
					matcher: /Do you want to use the next-on-pages eslint-plugin\?/,
					input: ["y"],
				},
			],
			testCommitMessage: true,
			verifyBuildCfTypes: {
				outputFile: "env.d.ts",
				envInterfaceName: "CloudflareEnv",
			},
			verifyDeploy: {
				route: "/",
				expectedText: "Create Next App",
			},
			// see https://github.com/cloudflare/next-on-pages/blob/main/packages/next-on-pages/docs/supported.md#operating-systems
			unsupportedOSs: ["win32"],
			verifyPreview: {
				route: "/",
				expectedText: "Create Next App",
			},
			flags: [
				"--typescript",
				"--no-install",
				"--eslint",
				"--tailwind",
				"--src-dir",
				"--app",
				"--turbopack",
				"--import-alias",
				"@/*",
			],
		},
		"next:workers": {
			argv: ["--platform", "workers"],
			timeout: LONG_TIMEOUT,
			testCommitMessage: true,
			flags: [
				"--ts",
				"--tailwind",
				"--eslint",
				"--app",
				"--turbopack",
				"--import-alias",
				"@/*",
				"--src-dir",
			],
			verifyBuildCfTypes: {
				outputFile: "cloudflare-env.d.ts",
				envInterfaceName: "CloudflareEnv",
			},
			verifyPreview: {
				previewArgs: ["--"],
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
		"nuxt:pages": {
			promptHandlers: [
				{
					matcher: /Would you like to install any of the official modules\?/,
					input: [keys.enter],
				},
			],
			argv: ["--platform", "pages"],
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
			verifyBuild: {
				outputDir: "./dist",
				script: "build",
				route: "/test",
				expectedText: "C3_TEST",
			},
		},
		"nuxt:workers": {
			promptHandlers: [
				{
					matcher: /Would you like to install any of the official modules\?/,
					input: [keys.enter],
				},
			],
			argv: ["--platform", "workers"],
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
		"react:pages": {
			argv: ["--platform", "pages"],
			promptHandlers: [
				{
					matcher: /Select a variant:/,
					input: [keys.enter],
				},
			],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			timeout: LONG_TIMEOUT,
			verifyDeploy: {
				route: "/",
				expectedText: "Vite + React",
			},
			verifyPreview: {
				route: "/",
				expectedText: "Vite + React",
			},
		},
		"react:workers": {
			argv: ["--platform", "workers"],
			promptHandlers: [
				{
					matcher: /Select a variant:/,
					input: [keys.enter],
				},
			],
			unsupportedOSs: ["win32"],
			testCommitMessage: true,
			verifyDeploy: {
				route: "/",
				// Note that this is the text in the static HTML that is returned
				// This React SPA will change this at runtime but we are only making a fetch request
				// not actually running the client side JS.
				expectedText: "Vite + React + TS",
			},
			verifyPreview: {
				route: "/",
				// We need to run the preview on the specific IP address on which we make the request.
				// By default `vite preview` runs on `localhost` that doesn't always include 127.0.0.1.
				previewArgs: ["--host=127.0.0.1"],
				// Note that this is the text in the static HTML that is returned
				// This React SPA will change this at runtime but we are only making a fetch request
				// not actually running the client side JS.
				expectedText: "Vite + React + TS",
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
		"svelte:pages": {
			argv: ["--platform", "pages"],
			flags: [
				"--no-install",
				"--no-add-ons",
				"--template",
				"minimal",
				"--types",
				"ts",
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
			verifyBuild: {
				outputDir: ".svelte-kit/cloudflare",
				script: "build",
				route: "/test",
				expectedText: "C3_TEST",
			},
		},
		"svelte:workers": {
			argv: ["--platform", "workers"],
			flags: [
				"--no-install",
				"--no-add-ons",
				"--template",
				"minimal",
				"--types",
				"ts",
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
		"vue:pages": {
			argv: ["--platform", "pages"],
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
		"vue:workers": {
			argv: ["--platform", "workers", "--ts"],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
			verifyDeploy: {
				route: "/",
				expectedText: "Vite App",
			},
			verifyPreview: {
				previewArgs: ["--host=127.0.0.1"],
				route: "/",
				expectedText: "Vite App",
			},
		},
	};
}
