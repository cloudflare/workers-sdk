import { Analog } from "./analog";
import { Angular } from "./angular";
import { Astro } from "./astro";
import { Hono } from "./hono";
import { NextJs } from "./next";
import { Nuxt } from "./nuxt";
import { Qwik } from "./qwik";
import { ReactRouter } from "./react-router";
import { SolidStart } from "./solid-start";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
import { TanstackStart } from "./tanstack";
import { Vike } from "./vike";
import { Vite } from "./vite";
import { Waku } from "./waku";
import type { Framework } from ".";

export function getFramework(detectedFramework?: {
	id: string;
	name: string;
}): Framework {
	switch (detectedFramework?.id) {
		case "astro":
			return new Astro(detectedFramework.name);
		case "svelte-kit":
			return new SvelteKit(detectedFramework.name);
		case "tanstack-start":
			return new TanstackStart(detectedFramework.name);
		case "react-router":
			return new ReactRouter(detectedFramework.name);
		case "angular":
			return new Angular(detectedFramework.name);
		case "nuxt":
			return new Nuxt(detectedFramework.name);
		case "solid-start":
			return new SolidStart(detectedFramework.name);
		case "qwik":
			return new Qwik(detectedFramework.name);
		case "vite":
			return new Vite(detectedFramework.name);
		case "analog":
			return new Analog(detectedFramework.name);
		case "next":
			return new NextJs(detectedFramework.name);
		case "hono":
			return new Hono(detectedFramework.name);
		case "vike":
			return new Vike(detectedFramework.name);
		case "waku":
			return new Waku(detectedFramework.name);
		default:
			return new Static(detectedFramework?.name);
	}
}
