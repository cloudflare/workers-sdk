import { Astro } from "./astro";
import { NextJs } from "./next";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";

export function getFramework(id: string) {
	if (id === "astro") {
		return new Astro();
	}
	if (id === "svelte-kit") {
		return new SvelteKit();
	}
	if (id === "next") {
		return new NextJs();
	}

	return new Static(id);
}
