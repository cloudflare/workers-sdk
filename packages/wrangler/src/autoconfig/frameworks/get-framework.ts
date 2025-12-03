import { Angular } from "./angular";
import { Astro } from "./astro";
import { Nuxt } from "./nuxt";
import { Qwik } from "./qwik";
import { ReactRouter } from "./react-router";
import { SolidStart } from "./solid-start";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
import { TanstackStart } from "./tanstack";
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
		default:
			return new Static(detectedFramework?.name);
	}
}
