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

export type FrameworkInfo = {
	id: string;
	name: string;
};

export function getFramework(detectedFramework?: FrameworkInfo): Framework {
	switch (detectedFramework?.id) {
		case "astro":
			return new Astro(detectedFramework);
		case "svelte-kit":
			return new SvelteKit(detectedFramework);
		case "tanstack-start":
			return new TanstackStart(detectedFramework);
		case "react-router":
			return new ReactRouter(detectedFramework);
		case "angular":
			return new Angular(detectedFramework);
		case "nuxt":
			return new Nuxt(detectedFramework);
		case "solid-start":
			return new SolidStart(detectedFramework);
		case "qwik":
			return new Qwik(detectedFramework);
		case "vite":
			return new Vite(detectedFramework);
		case "analog":
			return new Analog(detectedFramework);
		case "next":
			return new NextJs(detectedFramework);
		case "hono":
			return new Hono(detectedFramework);
		case "vike":
			return new Vike(detectedFramework);
		case "waku":
			return new Waku(detectedFramework);
		default:
			return new Static(detectedFramework ?? { id: "static", name: "Static" });
	}
}
