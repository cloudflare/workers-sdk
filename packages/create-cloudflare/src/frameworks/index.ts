import { crash } from "@cloudflare/cli";
import angular from "../../templates/angular/c3";
import astro from "../../templates/astro/c3";
import docusaurus from "../../templates/docusaurus/c3";
import gatsby from "../../templates/gatsby/c3";
import hono from "../../templates/hono/c3";
import next from "../../templates/next/c3";
import nuxt from "../../templates/nuxt/c3";
import qwik from "../../templates/qwik/c3";
import react from "../../templates/react/c3";
import remix from "../../templates/remix/c3";
import solid from "../../templates/solid/c3";
import svelte from "../../templates/svelte/c3";
import vue from "../../templates/vue/c3";
import clisPackageJson from "./package.json";
import type { FrameworkConfig, C3Context } from "types";

export const FrameworkMap: Record<string, FrameworkConfig> = {
	angular,
	astro,
	docusaurus,
	gatsby,
	hono,
	next,
	nuxt,
	qwik,
	react,
	remix,
	solid,
	svelte,
	vue,
};

export const supportedFramework = (framework: string) => {
	return Object.keys(FrameworkMap).includes(framework);
};

export const getFrameworkCli = (ctx: C3Context, withVersion = true) => {
	if (!ctx.framework) {
		return crash("Framework not specified.");
	}

	const framework = ctx.template
		.id as keyof typeof clisPackageJson.frameworkCliMap;
	const frameworkCli = clisPackageJson.frameworkCliMap[
		framework
	] as keyof typeof clisPackageJson.dependencies;
	const version = clisPackageJson.dependencies[frameworkCli];
	return withVersion ? `${frameworkCli}@${version}` : frameworkCli;
};
