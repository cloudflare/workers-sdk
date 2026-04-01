import assert from "node:assert";
import { Analog } from "./analog";
import { Angular } from "./angular";
import { Astro } from "./astro";
import { Hono } from "./hono";
import { NextJs } from "./next";
import { Nuxt } from "./nuxt";
import { CloudflarePages } from "./pages";
import { Qwik } from "./qwik";
import { ReactRouter } from "./react-router";
import { SolidStart } from "./solid-start";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
import { TanstackStart } from "./tanstack";
import { Vike } from "./vike";
import { Vite } from "./vite";
import { Waku } from "./waku";
import type { AutoConfigFrameworkPackageInfo, FrameworkInfo } from ".";

/**
 * Information about all the known frameworks, including frameworks that we know about but we don't support.
 *
 * The "static" framework is not included in this list.
 */
export const allKnownFrameworks = [
	{
		id: "analog",
		name: "Analog",
		class: Analog,
		frameworkPackageInfo: {
			name: "@analogjs/platform",
			// Analog didn't work well before 2.0.0 with Cloudflare
			// See: https://github.com/cloudflare/workers-sdk/issues/11470
			minimumVersion: "2.0.0",
			maximumKnownMajorVersion: "2",
		},
		supported: true,
	},
	{
		id: "angular",
		name: "Angular",
		class: Angular,
		frameworkPackageInfo: {
			name: "@angular/core",
			// Angular 19 introduced ssr.experimentalPlatform and AngularAppEngine
			// which are required for Cloudflare Workers support
			// See: https://github.com/angular/angular-cli/releases/tag/19.0.0
			minimumVersion: "19.0.0",
			maximumKnownMajorVersion: "21",
		},
		supported: true,
	},
	{
		id: "astro",
		name: "Astro",
		class: Astro,
		frameworkPackageInfo: {
			name: "astro",
			// Version 4 was the earliest version that we manually tested
			// in https://github.com/cloudflare/workers-sdk/pull/12938
			// earlier versions might also be supported but we haven't checked them
			minimumVersion: "4.0.0",
			maximumKnownMajorVersion: "6",
		},
		supported: true,
	},
	{
		id: "hono",
		name: "Hono",
		class: Hono,
		supported: false,
	},
	{
		id: "next",
		name: "Next.js",
		class: NextJs,
		frameworkPackageInfo: {
			name: "next",
			// 14.2.35 is the earliest version of Next.js officially supported by open-next
			// see: https://github.com/cloudflare/workers-sdk/pull/11704#discussion_r2634519440
			minimumVersion: "14.2.35",
			maximumKnownMajorVersion: "16",
		},
		supported: true,
	},
	{
		id: "nuxt",
		name: "Nuxt",
		class: Nuxt,
		frameworkPackageInfo: {
			name: "nuxt",
			// 3.21.0 is the first Nuxt version with Nitro 2.11+ which supports
			// cloudflare.deployConfig and cloudflare.nodeCompat options
			// See: https://github.com/nuxt/nuxt/releases/tag/v3.21.0
			// See: https://github.com/nitrojs/nitro/releases/tag/v2.11.0
			minimumVersion: "3.21.0",
			maximumKnownMajorVersion: "4",
		},
		supported: true,
	},
	{
		id: "qwik",
		name: "Qwik",
		class: Qwik,
		frameworkPackageInfo: {
			name: "@builder.io/qwik",
			// 1.1.0 added the `platform` option in the qwikCity() Vite plugin
			// which is required for getPlatformProxy integration
			// See: https://github.com/QwikDev/qwik/pull/3604
			minimumVersion: "1.1.0",
			maximumKnownMajorVersion: "1",
		},
		supported: true,
	},
	{
		id: "react-router",
		name: "React Router",
		class: ReactRouter,
		frameworkPackageInfo: {
			name: "react-router",
			// React Router v7 introduced framework mode with Vite integration and
			// react-router.config.ts which are required for Cloudflare Workers support
			// See: https://remix.run/blog/react-router-v7
			minimumVersion: "7.0.0",
			maximumKnownMajorVersion: "7",
		},
		supported: true,
	},
	{
		id: "solid-start",
		name: "Solid Start",
		class: SolidStart,
		frameworkPackageInfo: {
			name: "@solidjs/start",
			// 1.0.0 is the first stable release with Nitro/Cloudflare Workers support
			// See: https://github.com/solidjs/solid-start/releases/tag/v1.0.0
			minimumVersion: "1.0.0",
			maximumKnownMajorVersion: "2",
		},
		supported: true,
	},
	{
		id: "svelte-kit",
		name: "SvelteKit",
		class: SvelteKit,
		frameworkPackageInfo: {
			name: "@sveltejs/kit",
			// 2.20.3 is required by @sveltejs/adapter-cloudflare@7.0.0 which first
			// added Workers Static Assets support (cfTarget:workers option)
			// See: https://github.com/sveltejs/kit/releases/tag/%40sveltejs%2Fadapter-cloudflare%407.0.0
			minimumVersion: "2.20.3",
			maximumKnownMajorVersion: "2",
		},
		supported: true,
	},
	{
		id: "tanstack-start",
		name: "TanStack Start",
		class: TanstackStart,
		frameworkPackageInfo: {
			name: "@tanstack/react-start",
			// 1.132.0 is the first Release Candidate for TanStack Start that supports Cloudflare
			// See: https://github.com/TanStack/router/releases/tag/v1.132.0
			minimumVersion: "1.132.0",
			maximumKnownMajorVersion: "1",
		},
		supported: true,
	},
	{
		id: "vite",
		name: "Vite",
		class: Vite,
		frameworkPackageInfo: {
			name: "vite",
			// Vite 6 introduced the Environment API which @cloudflare/vite-plugin requires
			// See: https://vite.dev/blog/announcing-vite6#experimental-environment-api
			// (6.1.0 is the minimum version supported by the vite plugin:
			//  https://github.com/cloudflare/workers-sdk/blob/b9b7e9d9fe/packages/vite-plugin-cloudflare/package.json#L80
			//  we anyways allow for `6.0.x` versions since we bump them to `^6.1.0` in the autoconfig process)
			minimumVersion: "6.0.0",
			maximumKnownMajorVersion: "8",
		},
		supported: true,
	},
	{
		id: "vike",
		name: "Vike",
		class: Vike,
		frameworkPackageInfo: {
			name: "vike",
			minimumVersion: "0.0.0",
			maximumKnownMajorVersion: "0",
		},
		supported: true,
	},
	{
		id: "waku",
		name: "Waku",
		class: Waku,
		frameworkPackageInfo: {
			name: "waku",
			// Autoconfig could support Waku before 1.0.0-alpha.4, but different autoconfig logic
			// would need to be implemented for such versions, so we just decided to only support
			// version 1.0.0-alpha.4 and up
			// See: https://github.com/cloudflare/workers-sdk/pull/12657
			minimumVersion: "1.0.0-alpha.4",
			maximumKnownMajorVersion: "1",
		},
		supported: true,
	},
	{
		id: "cloudflare-pages",
		name: "Cloudflare Pages",
		class: CloudflarePages,
		// Autoconfiguring a Pages project into a Workers one is not yet supported
		supported: false,
	},
] as const satisfies FrameworkInfo[];

/**
 * Type specific for the "static" framework.
 *
 * It is supported by autoconfig but, unlike all other frameworks, it doesn't have a package associated to it
 */
type StaticFrameworkInfo = Omit<FrameworkInfo, "frameworkPackageInfo"> & {
	supported: true;
};

export const staticFramework = {
	id: "static",
	name: "Static",
	class: Static,
	supported: true,
} as const satisfies StaticFrameworkInfo;

/** Information for all the possible frameworks. This includes the "static" framework */
export const allFrameworksInfos = [
	staticFramework,
	...allKnownFrameworks,
] as const satisfies (FrameworkInfo | StaticFrameworkInfo)[];

/**
 * Gets the package information for a given framework, erroring if the framework
 * could not be determined or is not supported.
 *
 * Returns `undefined` for the "static" framework, which has no associated package.
 *
 * @param frameworkId The id of the target framework
 * @returns The framework's target package info, or undefined if the framework is "static"
 */
export function getFrameworkPackageInfo(
	frameworkId: FrameworkInfo["id"]
): AutoConfigFrameworkPackageInfo | undefined {
	if (frameworkId === staticFramework.id) {
		// The "static" framework does not have an associated package
		return undefined;
	}
	const targetedFramework = allKnownFrameworks.find(
		(framework) => framework.id === frameworkId
	);
	assert(
		targetedFramework,
		`Could not determine framework package info for ${JSON.stringify(
			frameworkId
		)}`
	);
	assert(
		targetedFramework.supported,
		`Framework unexpectedly not supported ${JSON.stringify(frameworkId)}`
	);
	return targetedFramework.frameworkPackageInfo;
}
