import { Astro } from "./astro";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";

export function getFramework(id: string) {
	if (id === "astro") {
		return new Astro();
	}
	if (id === "svelte-kit") {
		return new SvelteKit();
	}

	return new Static(id);
}
