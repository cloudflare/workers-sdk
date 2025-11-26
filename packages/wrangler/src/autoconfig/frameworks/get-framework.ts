import { Astro } from "./astro";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
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
		default:
			return new Static(detectedFramework?.name);
	}
}
