import { crash } from "helpers/cli";
import angular from "./angular";
import astro from "./astro";
import docusaurus from "./docusaurus";
import gatsby from "./gatsby";
import hono from "./hono";
import next from "./next";
import nuxt from "./nuxt";
import qwik from "./qwik";
import react from "./react";
import remix from "./remix";
import solid from "./solid";
import svelte from "./svelte";
import versionMap from "./versionMap.json";
import vue from "./vue";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

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

export const getFrameworkVersion = (ctx: PagesGeneratorContext) => {
	if (!ctx.framework) {
		return crash("Framework not specified.");
	}

	const framework = ctx.framework.name as keyof typeof versionMap;
	return versionMap[framework];
};

export const supportedFramework = (framework: string) => {
	return Object.keys(FrameworkMap).includes(framework);
};
