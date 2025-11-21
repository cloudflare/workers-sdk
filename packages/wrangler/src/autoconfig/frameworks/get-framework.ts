import { Astro } from "./astro";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
import { TanstackStart } from "./tanstack";

export function getFramework(id: string) {
	if (id === "astro") {
		return new Astro();
	}
	if (id === "svelte-kit") {
		return new SvelteKit();
	}
	if (id === "tanstack-start") {
		return new TanstackStart();
	}

	return new Static(id);
}
