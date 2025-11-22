import { Astro } from "./astro";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
import type { Framework } from ".";

export function getFramework(id?: string, name?: string): Framework {
	if (id === "astro") {
		return new Astro(name);
	}
	if (id === "svelte-kit") {
		return new SvelteKit(name);
	}

	return new Static(name);
}
